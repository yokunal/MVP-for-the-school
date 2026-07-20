"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Upload, Loader2 } from "lucide-react";
import { ALL_LIBRARIES, LIBRARY_LABELS, type Library } from "@/types";

type Mode = "create" | "edit";
type Format = "pdf" | "epub" | "both" | "none";

type BookInitial = {
  id: string;
  title: string;
  author: string;
  subject: string;
  synopsis: string;
  library: Library;
  hasPdf: boolean;
  hasEpub: boolean;
  hasCover: boolean;
};

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB cap

export function BookForm({
  mode,
  initial,
}: {
  mode: Mode;
  initial?: BookInitial;
}): React.ReactElement {
  const router = useRouter();
  const { push } = useToast();

  const [library, setLibrary] = useState<Library>(initial?.library ?? "GENERAL");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [epubFile, setEpubFile] = useState<File | null>(null);
  const [format, setFormat] = useState<Format>(
    initial
      ? initial.hasPdf && initial.hasEpub
        ? "both"
        : initial.hasPdf
          ? "pdf"
          : initial.hasEpub
            ? "epub"
            : "none"
      : "pdf"
  );
  const [cover, setCover] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [synopsis, setSynopsis] = useState(initial?.synopsis ?? "");

  const [step, setStep] = useState<"form" | "uploading" | "done">("form");
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function validate(): Promise<string | null> {
    if (!title.trim() || !author.trim() || !subject.trim() || !synopsis.trim()) {
      return "Title, author, subject, and synopsis are all required.";
    }
    if (mode === "create") {
      if (format === "none") return "Select at least one format.";
      if ((format === "pdf" || format === "both") && !pdfFile) {
        return "Select a PDF file.";
      }
      if ((format === "epub" || format === "both") && !epubFile) {
        return "Select an EPUB file.";
      }
      if (pdfFile && pdfFile.size > MAX_FILE_BYTES) {
        return `PDF file is too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB).`;
      }
      if (epubFile && epubFile.size > MAX_FILE_BYTES) {
        return `EPUB file is too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB).`;
      }
      if (cover && cover.size > 10 * 1024 * 1024) {
        return "Cover image must be 10 MB or smaller.";
      }
    }
    if (cover && cover.size > 10 * 1024 * 1024) {
      return "Cover image must be 10 MB or smaller.";
    }
    return null;
  }

  async function presignAndPut(fileToUpload: File, kind: "pdf" | "epub" | "cover"): Promise<string> {
    setProgress(`Requesting upload URL for ${kind}…`);
    let sigRes: Response;
    try {
      sigRes = await fetch("/api/admin/books/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          filename: fileToUpload.name,
          contentType: fileToUpload.type || "application/octet-stream",
        }),
      });
    } catch (e) {
      throw new Error(`Network error requesting upload URL: ${(e as Error).message}`);
    }

    let sigBody: string;
    try {
      sigBody = await sigRes.text();
      const sig = JSON.parse(sigBody) as { url?: string; key?: string; error?: string };
      if (!sigRes.ok || !sig.key) {
        throw new Error(sig.error || `Server returned ${sigRes.status}`);
      }

      if (sig.url && sig.url.startsWith("local-mode://")) {
        setProgress(`Saving ${kind} locally…`);
        const fd = new FormData();
        fd.set("key", sig.key);
        fd.set("file", fileToUpload);
        let upRes: Response;
        try {
          upRes = await fetch("/api/local/upload", {
            method: "POST",
            body: fd,
          });
        } catch (e) {
          throw new Error(`Network error uploading ${kind}: ${(e as Error).message}`);
        }
        const upBody = await upRes.text();
        let up: { error?: string };
        try {
          up = JSON.parse(upBody);
        } catch {
          throw new Error(`Local upload failed (HTTP ${upRes.status}): unexpected response`);
        }
        if (!upRes.ok) {
          throw new Error(up.error || `Local upload failed (${upRes.status})`);
        }
        return sig.key;
      }

      if (!sig.url) {
        throw new Error("Upload URL not provided");
      }
      setProgress(`Uploading ${kind}…`);
      const putRes = await fetch(sig.url, {
        method: "PUT",
        headers: { "content-type": fileToUpload.type || "application/octet-stream" },
        body: fileToUpload,
      });
      if (!putRes.ok) {
        throw new Error(`R2 upload failed (${putRes.status})`);
      }
      return sig.key;
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error(`${kind} upload: unexpected error (HTTP ${sigRes.status})`);
    }
  }

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const err = await validate();
    if (err) {
      setError(err);
      return;
    }
    setStep("uploading");
    try {
      let pdfKey: string | null = null;
      let epubKey: string | null = null;
      let coverImageKey: string | null = null;

      if (mode === "create") {
        if (format === "pdf" || format === "both") {
          if (!pdfFile) throw new Error("PDF file is required");
          pdfKey = await presignAndPut(pdfFile, "pdf");
        }
        if (format === "epub" || format === "both") {
          if (!epubFile) throw new Error("EPUB file is required");
          epubKey = await presignAndPut(epubFile, "epub");
        }
        if (cover) {
          coverImageKey = await presignAndPut(cover, "cover");
        }
        const createRes = await fetch("/api/admin/books", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            author,
            subject,
            synopsis,
            library,
            pdfKey,
            epubKey,
            coverImageKey,
          }),
        });
        const createBody = await createRes.text();
        let created: { id?: string; error?: string };
        try { created = JSON.parse(createBody); } catch { created = {}; }
        if (!createRes.ok || !created.id) {
          throw new Error(created.error || `Could not save book (HTTP ${createRes.status})`);
        }
        push({ title: "Book uploaded", description: title, variant: "default" });
        router.push("/admin/books");
        router.refresh();
      } else {
        // Edit mode: upload replacements if new files selected.
        if (cover) {
          coverImageKey = await presignAndPut(cover, "cover");
        }
        if (pdfFile) {
          pdfKey = await presignAndPut(pdfFile, "pdf");
        }
        if (epubFile) {
          epubKey = await presignAndPut(epubFile, "epub");
        }
        const patchRes = await fetch(
          `/api/admin/books/${initial!.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title,
              author,
              subject,
              synopsis,
              library,
              ...(coverImageKey ? { coverImageKey } : {}),
              ...(removeCover && !coverImageKey ? { coverImageKey: null } : {}),
              ...(pdfKey ? { pdfKey } : {}),
              ...(epubKey ? { epubKey } : {}),
            }),
          }
        );
        const patchBody = await patchRes.text();
        let result: { ok?: boolean; error?: string };
        try { result = JSON.parse(patchBody); } catch { result = {}; }
        if (!patchRes.ok || !result.ok) {
          throw new Error(result.error || `Could not update book (HTTP ${patchRes.status})`);
        }
        push({ title: "Book updated", description: title });
        router.push("/admin/books");
        router.refresh();
      }
      setStep("done");
    } catch (e) {
      setStep("form");
      setError((e as Error).message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* 1. Library */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Library</CardTitle>
          <CardDescription>Which library should this book live in?</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={library} onValueChange={(v) => setLibrary(v as Library)}>
            <SelectTrigger className="sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_LIBRARIES.map((l) => (
                <SelectItem key={l} value={l}>
                  {LIBRARY_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Edit mode: replace book files */}
      {mode === "edit" && (
        <Card>
          <CardHeader>
            <CardTitle>2 · Replace files (optional)</CardTitle>
            <CardDescription>
              Upload new PDF or EPUB to replace the current files. Leave blank to keep existing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {initial?.hasPdf && (
              <div>
                <Label htmlFor="edit-pdf" className="text-xs text-muted-foreground">Replace PDF</Label>
                <Input
                  id="edit-pdf"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                />
                {pdfFile && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(1)} MB)
                  </p>
                )}
              </div>
            )}
            {initial?.hasEpub && (
              <div>
                <Label htmlFor="edit-epub" className="text-xs text-muted-foreground">Replace EPUB</Label>
                <Input
                  id="edit-epub"
                  type="file"
                  accept=".epub,application/epub+zip"
                  onChange={(e) => setEpubFile(e.target.files?.[0] ?? null)}
                />
                {epubFile && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {epubFile.name} ({(epubFile.size / 1024 / 1024).toFixed(1)} MB)
                  </p>
                )}
              </div>
            )}
            {!initial?.hasPdf && !initial?.hasEpub && (
              <p className="text-xs text-muted-foreground">No files to replace — book has no PDF or EPUB.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2. Upload file */}
      {mode === "create" && (
        <Card>
          <CardHeader>
            <CardTitle>2 · File</CardTitle>
            <CardDescription>
              {format === "both"
                ? "Upload the PDF and EPUB files separately. Max 200 MB each."
                : format === "pdf"
                  ? "Pick the PDF file. Max 200 MB."
                  : "Pick the EPUB file. Max 200 MB."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(format === "pdf" || format === "both") && (
              <div>
                <Label htmlFor="pdf-file" className="text-xs text-muted-foreground">PDF file</Label>
                <Input
                  id="pdf-file"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                />
                {pdfFile && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(1)} MB)
                  </p>
                )}
              </div>
            )}
            {(format === "epub" || format === "both") && (
              <div>
                <Label htmlFor="epub-file" className="text-xs text-muted-foreground">EPUB file</Label>
                <Input
                  id="epub-file"
                  type="file"
                  accept=".epub,application/epub+zip"
                  onChange={(e) => setEpubFile(e.target.files?.[0] ?? null)}
                />
                {epubFile && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {epubFile.name} ({(epubFile.size / 1024 / 1024).toFixed(1)} MB)
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 3. Format */}
      {mode === "create" && (
        <Card>
          <CardHeader>
            <CardTitle>3 · Format</CardTitle>
            <CardDescription>
              Is this a PDF, an EPUB, or both?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={format} onValueChange={(v) => {
              setFormat(v as Format);
              // Reset file selections when format changes to avoid stale state.
              if (v !== "pdf" && v !== "both") setPdfFile(null);
              if (v !== "epub" && v !== "both") setEpubFile(null);
            }}>
              <SelectTrigger className="sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF only</SelectItem>
                <SelectItem value="epub">EPUB only</SelectItem>
                <SelectItem value="both">Both PDF + EPUB</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              {format === "pdf"
                ? "The uploaded file must be a PDF."
                : format === "epub"
                  ? "The uploaded file must be an EPUB."
                  : "Upload both PDF and EPUB files above."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 4. Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "create" ? "4 · Book details" : "3 · Edit details"}
          </CardTitle>
          <CardDescription>Title, author, subject, and a short synopsis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="author">Author / Writer</Label>
              <Input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Math, English Literature, Physics…"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="synopsis">Synopsis</Label>
            <Textarea
              id="synopsis"
              rows={5}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              required
            />
          </div>
        </CardContent>
      </Card>

      {/* 5. Cover */}
      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? "5" : "4"} · Cover image (optional)</CardTitle>
          <CardDescription>
            {mode === "create"
              ? "JPG/PNG/WebP, max 10 MB. Leave blank to skip."
              : "Upload to replace the existing cover. Leave blank to keep it."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              setCover(e.target.files?.[0] ?? null);
              if (e.target.files?.[0]) setRemoveCover(false); // new file replaces cover
            }}
          />
          {cover && (
            <p className="text-xs text-muted-foreground">
              {cover.name} ({(cover.size / 1024 / 1024).toFixed(1)} MB)
            </p>
          )}
          {mode === "edit" && initial?.hasCover && !cover && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRemoveCover((r) => !r)}
                className={removeCover ? "border-destructive text-destructive" : ""}
              >
                {removeCover ? "Cancel removal" : "Remove cover"}
              </Button>
              {removeCover && (
                <span className="text-xs text-destructive">Cover will be removed on save.</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {step === "uploading" && (
        <div className="rounded-md border bg-muted px-3 py-2 text-sm">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> {progress}
        </div>
      )}

      {/* 6. Submit */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/books")}>
          Cancel
        </Button>
        <Button type="submit" disabled={step === "uploading"}>
          <Upload className="h-4 w-4" />
          {mode === "create" ? "Upload book" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
