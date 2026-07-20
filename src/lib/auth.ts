import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginRateLimiter, ipWideRateLimiter, extractIp } from "@/lib/rate-limit";
import type { Role } from "@/types";

// In-memory cache for JWT callback DB checks.
// Prevents DB round-trip on every request while catching deactivation/role
// changes within 60s window. Single-process cache — safe for Railway.
// Max 2000 entries; LRU-style eviction by oldest-expiry-first when exceeded.
const jwtUserCache = new Map<string, { isActive: boolean; sessionVersion: number; expiresAt: number }>();
const JWT_CACHE_TTL_MS = 60_000;
const JWT_CACHE_MAX_SIZE = 2000;

/**
 * NextAuth configuration for the school library.
 *
 * - Credentials provider: email + password, verified against the User table.
 * - JWT sessions (no DB adapter). The token carries id / role / classGrade so
 *   middleware can authorize routes without a DB round-trip.
 * - Inactive users are rejected at sign-in.
 */
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 60, // 30 minutes
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email + Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Rate limiting: max 5 failed attempts per email+IP per 15 min.
        // Secondary IP-wide limiter: max 20/15min per IP (shared-network safety).
        const ip = extractIp(req?.headers as Record<string, string | string[] | undefined> | undefined);
        const rateKey = `${credentials.email.toLowerCase().trim()}:${ip}`;
        const rateCheck = loginRateLimiter.check(rateKey);
        const ipWideCheck = ipWideRateLimiter.check(ip);
        if (rateCheck.blocked || ipWideCheck.blocked) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user || !user.isActive) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) {
          loginRateLimiter.recordFailure(rateKey);
          ipWideRateLimiter.recordFailure(ip);
          return null;
        }

        // Success — clear any previous failures for this key.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as Role,
          classGrade: user.classGrade,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.classGrade = user.classGrade;
        token.mustChangePassword = user.mustChangePassword;
        token.sessionVersion = user.sessionVersion;
      }

      // On each token refresh, verify user still active and sessionVersion
      // matches. Cache result for 60s to avoid DB round-trip on every request.
      if (token.id) {
        const cached = jwtUserCache.get(token.id);
        if (cached) {
          if (Date.now() <= cached.expiresAt) {
            if (!cached.isActive || cached.sessionVersion !== token.sessionVersion) {
              return null as unknown as typeof token;
            }
            return token;
          }
          // Expired entry — remove it so map doesn't grow stale.
          jwtUserCache.delete(token.id);
        }

        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id },
            select: { isActive: true, sessionVersion: true },
          });
          if (!dbUser || !dbUser.isActive || dbUser.sessionVersion !== token.sessionVersion) {
            // Returning null clears the JWT cookie -> forces re-auth.
            return null as unknown as typeof token;
          }
          jwtUserCache.set(token.id, {
            isActive: dbUser.isActive,
            sessionVersion: dbUser.sessionVersion,
            expiresAt: Date.now() + JWT_CACHE_TTL_MS,
          });
          // Evict oldest-expiry entries when cache exceeds max size.
          if (jwtUserCache.size > JWT_CACHE_MAX_SIZE) {
            const sorted = [...jwtUserCache.entries()].sort(
              (a, b) => a[1].expiresAt - b[1].expiresAt
            );
            const toEvict = sorted.slice(0, Math.floor(jwtUserCache.size * 0.2));
            for (const [k] of toEvict) jwtUserCache.delete(k);
          }
        } catch {
          // DB unreachable — keep current token to avoid mass logouts
          // during transient outages. Cache NOT set so next request retries.
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.classGrade = token.classGrade;
        session.user.mustChangePassword = token.mustChangePassword;
        session.user.sessionVersion = token.sessionVersion;
      }
      return session;
    },
  },
};
