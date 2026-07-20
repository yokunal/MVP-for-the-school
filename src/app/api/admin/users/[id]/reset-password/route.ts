import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { CsvUserParser } from "@/lib/csv";
import { AuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/users/:id/reset-password
 *
 * Generates a new temporary password and returns it to the admin. The
 * admin must hand it to the user out-of-band (no email service).
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: { id: string } }
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const target = await prisma.user.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, isActive: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!target.isActive) {
    return NextResponse.json(
      { error: "Cannot reset password for a deactivated user. Reactivate first." },
      { status: 400 }
    );
  }

  const tempPassword = CsvUserParser.generateTempPassword();
  await prisma.user.update({
    where: { id: ctx.params.id },
    data: {
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
    },
  });

  await AuditLog.write(user.id, user.email, "PASSWORD_RESET", {
    targetUserId: ctx.params.id,
  });

  return NextResponse.json({ ok: true, tempPassword });
}
