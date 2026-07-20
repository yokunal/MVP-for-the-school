import { createHash, randomBytes } from "crypto";

/**
 * Helpers for naming uploaded files into R2. We never trust the original
 * filename — keys are a namespaced random hex digest so two users uploading
 * `book.pdf` don't collide and so the original filename never leaks back.
 */

export type UploadKind = "pdf" | "epub" | "cover";

const KIND_PREFIX: Record<UploadKind, string> = {
  pdf: "books/pdf",
  epub: "books/epub",
  cover: "covers",
};

// Magic byte signatures for server-side file-type validation.
// First 12 bytes suffice for all supported formats.
const SIGNATURES: Record<string, Uint8Array[]> = {
  pdf: [new Uint8Array([0x25, 0x50, 0x44, 0x46])], // %PDF
  epub: [new Uint8Array([0x50, 0x4b, 0x03, 0x04])], // PK\x03\x04 (ZIP)
  cover: [
    new Uint8Array([0xff, 0xd8, 0xff]),          // JPEG
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG
    new Uint8Array([0x47, 0x49, 0x46, 0x38]),    // GIF87a / GIF89a
    // WebP: RIFF....WEBP
    new Uint8Array([0x52, 0x49, 0x46, 0x46]),    // RIFF
  ],
};

/**
 * Validate file content by checking magic bytes (file signature).
 * Returns true if the first bytes of `buffer` match any known signature
 * for the given upload kind.
 */
export function validateMagicBytes(buffer: Buffer, kind: UploadKind): boolean {
  const sigs = SIGNATURES[kind];
  if (!sigs) return false;
  return sigs.some((sig) => {
    if (buffer.length < sig.length) return false;
    for (let i = 0; i < sig.length; i++) {
      if (buffer[i] !== sig[i]) return false;
    }
    // WebP needs an extra check at offset 8 for the "WEBP" marker.
    if (sig.length === 4 && sig[0] === 0x52 && sig[1] === 0x49 && sig[2] === 0x46 && sig[3] === 0x46) {
      if (buffer.length < 12) return false;
      return buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    }
    return true;
  });
}

/**
 * Infer UploadKind from a storage key path.
 * Key format: "books/pdf/<hash>.ext" → "pdf", "covers/<hash>.ext" → "cover".
 */
export function inferKind(key: string): UploadKind | null {
  if (key.startsWith("books/pdf/")) return "pdf";
  if (key.startsWith("books/epub/")) return "epub";
  if (key.startsWith("covers/")) return "cover";
  return null;
}

export class UploadKeyBuilder {
  static build(kind: UploadKind, originalFilename: string): {
    key: string;
    contentType: string;
  } {
    const ext = (originalFilename.split(".").pop() ?? "").toLowerCase();
    const safeExt =
      ext.length <= 6 && /^[a-z0-9]+$/.test(ext) ? `.${ext}` : "";
    const digest = createHash("sha256")
      .update(randomBytes(16))
      .digest("hex")
      .slice(0, 24);
    const key = `${KIND_PREFIX[kind]}/${digest}${safeExt}`;
    return { key, contentType: UploadKeyBuilder.contentTypeFor(kind, ext) };
  }

  static contentTypeFor(kind: UploadKind, ext: string): string {
    if (kind === "pdf") return "application/pdf";
    if (kind === "epub") return "application/epub+zip";
    // cover
    if (ext === "png") return "image/png";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    return "application/octet-stream";
  }

  static isValidExtension(kind: UploadKind, ext: string): boolean {
    const e = ext.toLowerCase();
    if (kind === "pdf") return e === "pdf";
    if (kind === "epub") return e === "epub";
    return ["png", "jpg", "jpeg", "webp", "gif"].includes(e);
  }
}
