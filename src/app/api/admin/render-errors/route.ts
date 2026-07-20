import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { AuditLog, AuditAction } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  bookId: z.string().min(1),
  kind: z.enum(["pdf", "epub", "cover"]),
  error: z.string().min(1).max(500),
});

/**
 * POST /api/admin/render-errors
 *
 * Reports a reader-side render failure (e.g. expired signed URL, PDF parse
 * error). Written to the audit log so admins can see how often users hit
 * broken renders.
 *
 * Called by the reader component on error — best-effort, non-blocking.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Best-effort audit log write (non-critical — don't block on DB).
  try {
    await AuditLog.write(user.id, user.email, AuditAction.BOOK_ERROR, {
      targetBookId: parsed.data.bookId,
      metadata: { kind: parsed.data.kind, error: parsed.data.error },
    });
  } catch {
    // Audit log failure is not a reason to reject the request.
  }

  return NextResponse.json({ ok: true });
}
