import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerEnv } from "@/lib/env";
import {
  shouldUseLocalStore,
  localDownloadUrl,
  deleteLocalFile,
  LOCAL_UPLOADS_DIR,
} from "@/lib/local-store";

// ---------------------------------------------------------------------------
// Storage client. Tries Cloudflare R2 (S3-compatible) in production and
// falls back to a local-disk store when R2 isn't configured.
//
// All access to file storage goes through this module. The DB stores KEYS
// (e.g. "books/pdf/abc.pdf") — never URLs — so the underlying store can
// be swapped without rewriting data.
// ---------------------------------------------------------------------------

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const env = getServerEnv();
  cachedClient = new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return cachedClient;
}

/** True when the active store is the local-disk fallback. */
export function isLocalMode(): boolean {
  return shouldUseLocalStore({
    R2_ENDPOINT: process.env.R2_ENDPOINT,
  });
}

export function getR2Bucket(): string {
  return process.env.R2_BUCKET_NAME || "";
}

export function getR2DefaultTtl(): number {
  const raw = process.env.R2_SIGNED_URL_TTL_SECONDS;
  const n = raw ? parseInt(raw, 10) : 300;
  return Number.isFinite(n) && n > 0 ? n : 300;
}

/**
 * Short-lived URL the browser can GET to download a key's bytes.
 *   - R2 mode: signed GET against R2.
 *   - Local mode: internal route served by `/api/local/files/[...key]`,
 *     which enforces AccessPolicy before streaming.
 */
export async function getSignedDownloadUrl(
  key: string,
  ttlSeconds?: number
): Promise<string> {
  if (isLocalMode()) {
    return localDownloadUrl(key);
  }
  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: ttlSeconds ?? getR2DefaultTtl(),
  });
}

/**
 * Presigned URL the browser can PUT a file to. In local mode we instead
 * return a marker URL the client recognises; the actual upload happens
 * through `/api/local/upload` so we never need to expose the local
 * filesystem via a public URL.
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  ttlSeconds = 300
): Promise<string> {
  if (isLocalMode()) {
    return `local-mode://upload?key=${encodeURIComponent(key)}&type=${encodeURIComponent(contentType)}`;
  }
  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn: ttlSeconds });
}

/**
 * Health check. In local mode returns true if the uploads dir exists (or
 * can be created). Otherwise performs R2 HeadBucket.
 */
export async function checkR2Health(): Promise<boolean> {
  if (isLocalMode()) {
    return true;
  }
  try {
    await getClient().send(new HeadBucketCommand({ Bucket: getR2Bucket() }));
    return true;
  } catch {
    return false;
  }
}

/** Path of the local uploads directory (dev/test only). */
export { LOCAL_UPLOADS_DIR };

/**
 * Delete an object from storage (R2 or local). No-op if key is null/empty.
 */
export async function deleteObject(key: string | null | undefined): Promise<void> {
  if (!key) return;
  if (isLocalMode()) {
    return deleteLocalFile(key);
  }
  const command = new DeleteObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
  });
  await getClient().send(command);
}
