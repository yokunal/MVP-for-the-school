import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { isLocalMode } from "@/lib/r2";
import { saveLocalFile, localPathFor } from "@/lib/local-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/local/upload — dev/test-only route.
 *
 * Body: multipart/form-data with fields
 *   - key  (the R2-shaped object key the client was issued)
 *   - file (the file blob)
 *
 * Writes the file body to `<repo>/.uploads/<key>`. Returns the same shape
 * the presign endpoint used to return in R2 mode.
 *
 * Activation:
 *   - Only accepts uploads when `isLocalMode()` is true. In R2 mode the
 *     browser PUTs directly to the presigned URL instead.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isLocalMode()) {
    return NextResponse.json(
      { error: "Local upload is disabled. Configure R2 or set STORAGE_DRIVER=local." },
      { status: 404 }
    );
  }
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const KeySchema = z.string().min(3).max(300).regex(/^[a-z0-9/._-]+$/i);
  const keyRaw = form.get("key");
  const fileRaw = form.get("file");
  if (typeof keyRaw !== "string") {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }
  if (!(fileRaw instanceof Blob)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const keyParsed = KeySchema.safeParse(keyRaw);
  if (!keyParsed.success) {
    return NextResponse.json({ error: "invalid key" }, { status: 400 });
  }

  const buffer = Buffer.from(await fileRaw.arrayBuffer());
  try {
    await saveLocalFile(keyParsed.data, buffer, fileRaw.type || "application/octet-stream");
  } catch (err) {
    return NextResponse.json(
      { error: `Could not save file: ${(err as Error).message}` },
      { status: 500 }
    );
  }
  return NextResponse.json({
    key: keyParsed.data,
    contentType: fileRaw.type || "application/octet-stream",
    size: buffer.byteLength,
    path: localPathFor(keyParsed.data),
  });
}
