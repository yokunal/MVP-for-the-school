import { withAuth } from "next-auth/middleware";

/**
 * Route protection.
 *
 * - Everything except /login, /api/auth/*, and the public assets listed below
 *   requires a signed-in user.
 * - /admin/* requires role=ADMIN (checked via JWT).
 *
 * Note: `withAuth` reads the JWT shape defined in src/types/next-auth.d.ts.
 */
export default withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      const isAdminRoute = req.nextUrl.pathname.startsWith("/admin");

      // Login pages and the API auth endpoints are always public.
      if (req.nextUrl.pathname === "/login") return true;

      if (!token) return false;
      if (isAdminRoute) return token.role === "ADMIN";
      return true;
    },
  },
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    // Everything except static assets, _next internals, favicon, login itself
    // and the NextAuth API.
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/health|login).*)",
  ],
};
