import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changePasswordRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/auth/change-password
 *
 * Body: { currentPassword: string, newPassword: string }
 *
 * Allows logged-in user to change password. Clears mustChangePassword flag.
 * Requires current password verification. New password min 6 chars.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await req.json()) as { currentPassword?: string; newPassword?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.currentPassword || !body.newPassword) {
    return NextResponse.json(
      { error: "currentPassword and newPassword are required" },
      { status: 400 }
    );
  }

  // Rate limiting: max 3 wrong attempts per 5 min per user.
  const rateKey = `change-pwd:${session.user.id}`;
  const rateCheck = changePasswordRateLimiter.check(rateKey);
  if (rateCheck.blocked) {
    return NextResponse.json(
      { error: `Too many attempts. Try again later.` },
      { status: 429 }
    );
  }

  if (body.newPassword.length < 6) {
    return NextResponse.json(
      { error: "New password must be at least 6 characters" },
      { status: 400 }
    );
  }

  if (body.newPassword.length > 128) {
    return NextResponse.json(
      { error: "New password must be at most 128 characters" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!valid) {
    changePasswordRateLimiter.recordFailure(rateKey);
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 403 }
    );
  }

  const newHash = await bcrypt.hash(body.newPassword, 12);

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
      sessionVersion: { increment: 1 },
    },
  });

  return NextResponse.json({ ok: true });
}
