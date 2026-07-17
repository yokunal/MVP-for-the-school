// Tiny ext → mime mapper so we don't need the full `mime-types` package.

const TABLE: Record<string, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  txt: "text/plain",
  html: "text/html",
  json: "application/json",
};

export function lookup(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return TABLE[ext] ?? "application/octet-stream";
}
