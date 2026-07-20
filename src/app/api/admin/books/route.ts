import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isLibraryEnum } from "@/lib/csv";
import { setObjectCacheControl, validateStoredFileSignature } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(120),
  synopsis: z.string().trim().min(1).max(8000),
  library: z.string().refine(isLibraryEnum, { message: "Invalid library" }),
  pdfKey: z.string().min(1).nullable().optional(),
  epubKey: z.string().min(1).nullable().optional(),
  coverImageKey: z.string().min(1).nullable().optional(),
});

/**
 * POST /api/admin/books — create a book from R2 keys.
 * PATCH /api/admin/books/:id is the matching update endpoint (separate file).
 * DELETE /api/admin/books/:id is the matching delete endpoint (separate file).
 *
 * The actual files live in R2; this route only stores their keys.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    );
  }

  const pdfKey = parsed.data.pdfKey ?? null;
  const epubKey = parsed.data.epubKey ?? null;
  if (!pdfKey && !epubKey) {
    return NextResponse.json(
      { error: "A book must include at least one PDF or EPUB file." },
      { status: 400 }
    );
  }

  // Server-side magic-byte validation for all uploaded files.
  const keysToValidate = [pdfKey, epubKey, parsed.data.coverImageKey ?? null].filter(Boolean) as string[];
  for (const k of keysToValidate) {
    const sigError = await validateStoredFileSignature(k);
    if (sigError) {
      return NextResponse.json({ error: sigError }, { status: 400 });
    }
  }

  try {
    const book = await prisma.book.create({
      data: {
        title: parsed.data.title,
        author: parsed.data.author,
        subject: parsed.data.subject,
        synopsis: parsed.data.synopsis,
        library: parsed.data.library,
        pdfKey,
        epubKey,
        coverImageKey: parsed.data.coverImageKey ?? null,
        uploadedById: user.id,
      },
    });

    // Best-effort: set Cache-Control on R2 objects so Cloudflare edge
    // caches them.  Non-blocking — the book was already created.
    const CACHE_CONTROL = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400";
    for (const k of [pdfKey, epubKey, parsed.data.coverImageKey].filter(Boolean) as string[]) {
      setObjectCacheControl(k, CACHE_CONTROL).catch(() => {
        /* non-critical — cache headers are a performance optimisation */
      });
    }

    return NextResponse.json({ id: book.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin/books] create failed:", msg);
    return NextResponse.json(
      { error: `Could not save book: ${msg.slice(0, 200)}` },
      { status: 500 }
    );
  }
}
