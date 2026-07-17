import { existsSync } from "fs";
import { mkdir, stat, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import { join, normalize, resolve } from "path";
import { lookup as mimeLookup } from "./mime";

/**
 * Local-disk file store. Used as a drop-in fallback when Cloudflare R2 is
 * not configured — the DB still stores R2-shaped keys (e.g. "books/pdf/abc.pdf")
 * and `getSignedDownloadUrl` / `getSignedUploadUrl` resolve them transparently.
 *
 * Two-phase activation:
 *   1. `local-mode` is on when `R2_ENDPOINT` is empty or matches the
 *      placeholder pattern from .env.example.
 *   2. Files land under `<repo>/.uploads/<key>`. Download is served by the
 *      `/api/local/files/[...key]` route, which enforces AccessPolicy.
 */

const REPO_ROOT = process.cwd();
export const LOCAL_UPLOADS_DIR = resolve(REPO_ROOT, ".uploads");

const PLACEHOLDER_PATTERNS = [
  /^https?:\/\/placeholder/,
  /^https?:\/\/example\.com/,
];

/** True when env indicates local-disk storage should be used. */
export function shouldUseLocalStore(
  env: { R2_ENDPOINT?: string | undefined },
  force = process.env.STORAGE_DRIVER === "local"
): boolean {
  if (force) return true;
  if (process.env.STORAGE_DRIVER === "r2") return false;
  const ep = env.R2_ENDPOINT?.trim();
  if (!ep) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(ep));
}

/** Sanity check that an R2-shaped key is safe to embed in a local path. */
function safeKey(key: string): string {
  if (!key || key.includes("\0")) {
    throw new Error("invalid object key");
  }
  // Normalize (OS-dependent: on Windows, / → \) then convert back to
  // forward slashes so URLs and DB key lookups stay consistent.
  const norm = normalize(key).replace(/^[\\/]+/, "").replace(/\\/g, "/");
  if (norm.startsWith("..") || norm.includes("../") || norm.includes("/..")) {
    throw new Error("key escapes uploads directory");
  }
  return norm;
}

function pathFor(key: string): string {
  return join(LOCAL_UPLOADS_DIR, safeKey(key));
}

export async function saveLocalFile(
  key: string,
  body: Buffer | Uint8Array,
  _contentType: string
): Promise<void> {
  const target = pathFor(key);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, body);
}

export function localFileExists(key: string): boolean {
  return existsSync(pathFor(key));
}

export function localFileStat(key: string): Promise<{ size: number } | null> {
  return stat(pathFor(key))
    .then((s) => ({ size: s.size }))
    .catch(() => null);
}

export function openLocalStream(key: string): {
  stream: ReturnType<typeof createReadStream>;
  size: number;
} | null {
  const p = pathFor(key);
  if (!existsSync(p)) return null;
  const s = statSyncSafe(p);
  if (!s) return null;
  return { stream: createReadStream(p), size: s.size };
}

// `statSync` is not under fs/promises; import lazily so the bundler keeps the
// rest of this module tree-shakeable on the client.
function statSyncSafe(p: string): { size: number } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("fs").statSync(p) as { size: number };
  } catch {
    return null;
  }
}

export function localPathFor(key: string): string {
  return pathFor(key);
}

/** Build a stable URL the browser can hit to download a local file. */
export function localDownloadUrl(key: string): string {
  return `/api/local/files/${safeKey(key).split("/").map(encodeURIComponent).join("/")}`;
}
