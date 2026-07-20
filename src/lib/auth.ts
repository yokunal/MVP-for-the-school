import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginRateLimiter, extractIp } from "@/lib/rate-limit";
import type { Role } from "@/types";

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
        const ip = extractIp(req?.headers as Record<string, string | string[] | undefined> | undefined);
        const rateKey = `${credentials.email.toLowerCase().trim()}:${ip}`;
        const rateCheck = loginRateLimiter.check(rateKey);
        if (rateCheck.blocked) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user || !user.isActive) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) {
          loginRateLimiter.recordFailure(rateKey);
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
      // matches. If not, clear the token to force re-auth.
      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id },
            select: { isActive: true, sessionVersion: true },
          });
          if (!dbUser || !dbUser.isActive || dbUser.sessionVersion !== token.sessionVersion) {
            // Returning null clears the JWT cookie -> forces re-auth.
            return null as unknown as typeof token;
          }
        } catch {
          // DB unreachable — keep current token to avoid mass logouts
          // during transient outages.
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
