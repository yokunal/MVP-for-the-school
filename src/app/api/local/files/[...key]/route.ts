import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { lookup as mimeLookup } from "@/lib/mime";
import { localFileStat, localPathFor } from "@/lib/local-store";
import { isLocalMode } from "@/lib/r2";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { AccessPolicy } from "@/lib/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/local/files/<key>
 *
 * Serves locally-stored book files (PDF / EPUB / cover) to authenticated
 * users who are allowed to read the parent book. This is the dev-mode
 * counterpart of `/api/files/sign` — in local mode the client uses it
 * directly instead of an R2 signed URL.
 *
 * Note: This local-mode endpoint has no URL expiry (unlike R2 signed URLs
 * which have a 300s default TTL). Acceptable for local development. In
 * production (R2 mode), signed URLs enforce expiry automatically.
 *
 * Key shape: "books/pdf/<id>.pdf", "books/epub/<id>.epub", or "covers/<id>.jpg".
 * We resolve the parent book by trimming the filename prefix.
 */
export async function GET(
  req: Request
): Promise<Response> {
  if (!isLocalMode()) {
    return new Response("not available in R2 mode", { status: 404 });
  }

  const user = await getSessionUser();
  if (!user) {
    return new Response("not signed in", { status: 401 });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/local\/files\//, "");
  const key = decodeURIComponent(path);

  // Resolve to a Book row.
  const book = await prisma.book.findFirst({
    where: {
      OR: [
        { pdfKey: key },
        { epubKey: key },
        { coverImageKey: key },
      ],
      deletedAt: null,
    },
    select: { id: true, library: true },
  });
  if (!book) {
    return new Response("not found", { status: 404 });
  }
  if (!AccessPolicy.canReadBook(user.role, user.classGrade, book.library)) {
    return new Response("forbidden", { status: 403 });
  }

  const filePath = localPathFor(key);
  const info = await localFileStat(key);
  if (!info) {
    return new Response("not found", { status: 404 });
  }

  const stream = createReadStream(filePath);
  const contentType = mimeLookup(key);
  // Node 18+ ReadableStream: convert node Readable → web stream
  const webStream = nodeToWebStream(stream);
  return new Response(webStream, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(info.size),
      "cache-control": "private, max-age=300",
    },
  });
}

function nodeToWebStream(
  stream: NodeJS.ReadableStream
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => {
        controller.enqueue(
          chunk instanceof Uint8Array ? chunk : Buffer.from(chunk)
        );
      });
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      (stream as unknown as { destroy?: () => void }).destroy?.();
    },
  });
}
