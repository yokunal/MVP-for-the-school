import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Server-side helpers for reading the current session inside pages and route
 * handlers. Using `getServerSession(authOptions)` keeps us in sync with the
 * middleware (same JWT shape).
 */

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

/** Throws/redirects to /login if not signed in. */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Throws/redirects if user is not an admin. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/** Throws/redirects if user cannot access admin (used by middleware too). */
export async function requireAdminApi() {
  const user = await getSessionUser();
  if (!user) {
    return { error: { status: 401, message: "Not signed in" } };
  }
  if (user.role !== "ADMIN") {
    return { error: { status: 403, message: "Admin only" } };
  }
  return { user };
}
