import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isLibraryEnum } from "@/lib/csv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PatchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  author: z.string().trim().min(1).max(200).optional(),
  subject: z.string().trim().min(1).max(120).optional(),
  synopsis: z.string().trim().min(1).max(8000).optional(),
  library: z.string().refine(isLibraryEnum).optional(),
  coverImageKey: z.string().min(1).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: { bookId: string } }
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    );
  }

  const existing = await prisma.book.findUnique({
    where: { id: ctx.params.bookId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  try {
    await prisma.book.update({
      where: { id: ctx.params.bookId },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.author !== undefined && { author: parsed.data.author }),
        ...(parsed.data.subject !== undefined && { subject: parsed.data.subject }),
        ...(parsed.data.synopsis !== undefined && { synopsis: parsed.data.synopsis }),
        ...(parsed.data.library !== undefined && { library: parsed.data.library }),
        ...(parsed.data.coverImageKey !== undefined && {
          coverImageKey: parsed.data.coverImageKey,
        }),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/books] PATCH failed:", msg);
    return NextResponse.json(
      { error: `Could not update book: ${msg.slice(0, 200)}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: { bookId: string } }
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const existing = await prisma.book.findUnique({
    where: { id: ctx.params.bookId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }
  try {
    // ReadingProgress cascades via Prisma onDelete: Cascade.
    await prisma.book.delete({ where: { id: ctx.params.bookId } });
    // R2 keys are left in place (intentional — non-destructive on delete).
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/books] DELETE failed:", msg);
    return NextResponse.json(
      { error: `Could not delete book: ${msg.slice(0, 200)}` },
      { status: 500 }
    );
  }
}
