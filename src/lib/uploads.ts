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
