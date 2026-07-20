import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { AuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH /api/admin/users/:id — update user fields.
 *
 * Supported fields:
 *   - isActive: boolean — activate/deactivate user
 *   - role: "ADMIN" | "TEACHER" | "STUDENT" — change user role
 *
 * Both actions increment sessionVersion to force re-auth.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } }
): Promise<NextResponse> {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  let bumpVersion = false;

  if (typeof body.isActive === "boolean") {
    if (sessionUser.id === ctx.params.id && !body.isActive) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account." },
        { status: 400 }
      );
    }
    data.isActive = body.isActive;
    bumpVersion = true;
  }

  if (typeof body.role === "string") {
    if (!["ADMIN", "TEACHER", "STUDENT"].includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    data.role = body.role;
    bumpVersion = true;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update (isActive or role)" },
      { status: 400 }
    );
  }

  if (bumpVersion) {
    data.sessionVersion = { increment: 1 };
  }

  await prisma.user.update({
    where: { id: ctx.params.id },
    data,
  });

  // Write audit log for each changed field
  if (typeof body.isActive === "boolean") {
    AuditLog.write(
      sessionUser.id,
      sessionUser.email,
      body.isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
      { targetUserId: ctx.params.id }
    );
  }
  if (typeof body.role === "string") {
    AuditLog.write(sessionUser.id, sessionUser.email, "ROLE_CHANGED", {
      targetUserId: ctx.params.id,
      metadata: { newRole: body.role },
    });
  }

  return NextResponse.json({ ok: true });
}
