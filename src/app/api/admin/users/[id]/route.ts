import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH /api/admin/users/:id — toggle isActive on/off.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } }
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { isActive?: boolean };
  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive is required" }, { status: 400 });
  }
  if (user.id === ctx.params.id && !body.isActive) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account." },
      { status: 400 }
    );
  }
  await prisma.user.update({
    where: { id: ctx.params.id },
    data: { isActive: body.isActive },
  });
  return NextResponse.json({ ok: true });
}
