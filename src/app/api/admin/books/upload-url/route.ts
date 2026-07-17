import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { getSignedUploadUrl } from "@/lib/r2";
import { UploadKeyBuilder } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  kind: z.enum(["pdf", "epub", "cover"]),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
});

/**
 * POST /api/admin/books/upload-url
 *
 * Returns a presigned R2 PUT URL the browser can use to upload a file
 * directly to R2 (no data goes through the Next.js server). Admin only.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
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

  const ext = (parsed.data.filename.split(".").pop() ?? "").toLowerCase();
  if (!UploadKeyBuilder.isValidExtension(parsed.data.kind, ext)) {
    return NextResponse.json(
      { error: `Invalid ${parsed.data.kind} file extension (.${ext})` },
      { status: 400 }
    );
  }

  const { key } = UploadKeyBuilder.build(parsed.data.kind, parsed.data.filename);
  const contentType = UploadKeyBuilder.contentTypeFor(parsed.data.kind, ext);

  try {
    const url = await getSignedUploadUrl(key, contentType, 600);
    return NextResponse.json({ url, key, contentType });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not sign upload URL: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
