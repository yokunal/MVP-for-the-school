import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { AccessPolicy } from "@/lib/access";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PutBody = z.object({
  location: z.string().min(1).max(200),
});

/**
 * Per-book reading position.
 *   GET /api/reading-progress/:bookId  → { location: string | null }
 *   PUT /api/reading-progress/:bookId  { location: string }
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: { bookId: string } }
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const book = await prisma.book.findFirst({
    where: { id: ctx.params.bookId, deletedAt: null },
    select: { library: true },
  });
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }
  if (!AccessPolicy.canReadBook(user.role, user.classGrade, book.library)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await prisma.readingProgress.findUnique({
    where: { userId_bookId: { userId: user.id, bookId: ctx.params.bookId } },
    select: { lastLocation: true, updatedAt: true },
  });
  return NextResponse.json({
    location: row?.lastLocation ?? null,
    updatedAt: row?.updatedAt ?? null,
  });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: { bookId: string } }
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const book = await prisma.book.findFirst({
    where: { id: ctx.params.bookId, deletedAt: null },
    select: { library: true },
  });
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }
  if (!AccessPolicy.canReadBook(user.role, user.classGrade, book.library)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PutBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    );
  }

  await prisma.readingProgress.upsert({
    where: { userId_bookId: { userId: user.id, bookId: ctx.params.bookId } },
    create: {
      userId: user.id,
      bookId: ctx.params.bookId,
      lastLocation: parsed.data.location,
    },
    update: { lastLocation: parsed.data.location },
  });

  return NextResponse.json({ ok: true });
}
