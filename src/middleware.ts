import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

// Fail fast at server start if auth env is misconfigured.
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error(
    "NEXTAUTH_SECRET is not set. Add it to your .env file. " +
    "Generate one with: openssl rand -base64 32"
  );
}

/**
 * Route protection.
 *
 * - Everything except /login, /api/auth/*, /change-password, and the public
 *   assets listed below requires a signed-in user.
 * - /admin/* requires role=ADMIN (checked via JWT).
 * - If the user has mustChangePassword=true, they are redirected to
 *   /change-password from every page EXCEPT /change-password itself and
 *   /api/auth/* (to allow the password-change API call).
 */
export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;

  // Public paths — always allow.
  if (
    path === "/login" ||
    path === "/change-password" ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/health") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // API routes: return JSON 401/403 instead of HTML redirect.
  if (path.startsWith("/api/")) {
    if (!token) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    if (token.mustChangePassword) {
      return NextResponse.json(
        { error: "Must change password before accessing this resource" },
        { status: 403 }
      );
    }
    if (path.startsWith("/api/admin") && token.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Not signed in — redirect to login.
  if (!token) {
    const signInUrl = new URL("/login", req.url);
    signInUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(signInUrl);
  }

  // Must change password — redirect to change-password page.
  if (token.mustChangePassword) {
    const changeUrl = new URL("/change-password", req.url);
    changeUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(changeUrl);
  }

  // Admin routes — check role.
  if (path.startsWith("/admin") && token.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/health|login|change-password).*)",
  ],
};
