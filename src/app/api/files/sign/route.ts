import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSignedDownloadUrl } from "@/lib/r2";
import { getSessionUser } from "@/lib/session";
import { AccessPolicy } from "@/lib/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SignKind = "pdf" | "epub" | "cover";

const KIND_TO_FIELD = {
  pdf: "pdfKey",
  epub: "epubKey",
  cover: "coverImageKey",
} as const satisfies Record<SignKind, keyof import("@prisma/client").Book>;

function isKind(value: string): value is SignKind {
  return value === "pdf" || value === "epub" || value === "cover";
}

type SignResponse =
  | { url: string; expiresAt: string; kind: SignKind }
  | { error: string };

/**
 * GET /api/files/sign?bookId=...&kind=pdf|epub|cover
 *
 * Translates an R2 key into a short-lived signed URL. The DB only stores keys.
 *
 * Auth:
 *   - Any signed-in user can request a cover (if they can read the book).
 *   - PDF/EPUB require that the user can READ the book. Admins get a bypass
 *     on the metadata read but NOT on the file (admins don't need to read
 *     books in this product, so we just return 403 for them anyway).
 */
export async function GET(req: NextRequest): Promise<NextResponse<SignResponse>> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const bookId = req.nextUrl.searchParams.get("bookId");
  const kindParam = req.nextUrl.searchParams.get("kind");

  if (!bookId) {
    return NextResponse.json({ error: "bookId is required" }, { status: 400 });
  }
  if (!kindParam || !isKind(kindParam)) {
    return NextResponse.json(
      { error: "kind must be one of: pdf, epub, cover" },
      { status: 400 }
    );
  }

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      library: true,
      pdfKey: true,
      epubKey: true,
      coverImageKey: true,
    },
  });

  if (!book) {
    return NextResponse.json({ error: "book not found" }, { status: 404 });
  }

  // Access check
  if (
    !AccessPolicy.canReadBook(user.role, user.classGrade, book.library)
  ) {
    return NextResponse.json(
      { error: "You do not have access to this book" },
      { status: 403 }
    );
  }

  const field = KIND_TO_FIELD[kindParam];
  const key = book[field];
  if (!key) {
    return NextResponse.json(
      { error: `this book has no ${kindParam} file` },
      { status: 404 }
    );
  }

  const url = await getSignedDownloadUrl(key);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return NextResponse.json({ url, expiresAt, kind: kindParam });
}
