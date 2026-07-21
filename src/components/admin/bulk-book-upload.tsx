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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { ALL_LIBRARIES, LIBRARY_LABELS, type Library } from "@/types";
import { Upload, Loader2, FileUp, X } from "lucide-react";

type BookEntry = {
  file: File;
  title: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB

function titleFromFilename(name: string): string {
  // Strip extension, replace dashes/underscores with spaces, capitalise words
  return name
    .replace(/\.[^.]+$/, "") // strip extension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BulkBookUpload(): React.ReactElement {
  const router = useRouter();
  const { push } = useToast();

  const [author, setAuthor] = useState("");
  const [subject, setSubject] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [library, setLibrary] = useState<Library>("GENERAL");
  const [books, setBooks] = useState<BookEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const newEntries: BookEntry[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        push({ title: `Skipped "${file.name}" — only PDF files supported`, variant: "destructive" });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        push({ title: `Skipped "${file.name}" — exceeds 200 MB limit`, variant: "destructive" });
        continue;
      }
      newEntries.push({
        file,
        title: titleFromFilename(file.name),
        status: "pending",
      });
    }
    setBooks((prev) => [...prev, ...newEntries]);
  }

  function removeBook(index: number) {
    setBooks((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTitle(index: number, title: string) {
    setBooks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, title } : b))
    );
  }

  async function uploadAll() {
    if (!author.trim() || !subject.trim()) {
      setError("Author and subject are required for all books.");
      return;
    }
    if (books.length === 0) {
      setError("Add at least one PDF file.");
      return;
    }
    if (books.some((b) => !b.title.trim())) {
      setError("All books must have a title.");
      return;
    }

    setBusy(true);
    setError(null);

    let created = 0;
    let failed = 0;

    for (let i = 0; i < books.length; i++) {
      const entry = books[i];
      if (entry.status === "done") continue;

      setBooks((prev) =>
        prev.map((b, idx) =>
          idx === i ? { ...b, status: "uploading" as const } : b
        )
      );

      try {
        // Step 1: Get presigned URL
        const sigRes = await fetch("/api/admin/books/upload-url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "pdf",
            filename: entry.file.name,
            contentType: entry.file.type || "application/pdf",
          }),
        });
        const sigBody = await sigRes.text();
        const sig = JSON.parse(sigBody) as {
          url?: string;
          key?: string;
          error?: string;
        };
        if (!sigRes.ok || !sig.key) {
          throw new Error(sig.error || `Upload URL failed (${sigRes.status})`);
        }

        let pdfKey: string;

        if (sig.url && sig.url.startsWith("local-mode://")) {
          // Local dev mode
          const fd = new FormData();
          fd.set("key", sig.key);
          fd.set("file", entry.file);
          const upRes = await fetch("/api/local/upload", {
            method: "POST",
            body: fd,
          });
          const upBody = await upRes.text();
          const up = JSON.parse(upBody) as { error?: string };
          if (!upRes.ok) throw new Error(up.error || "Local upload failed");
          pdfKey = sig.key;
        } else {
          // R2 mode: PUT directly to presigned URL
          if (!sig.url) throw new Error("Upload URL not provided");
          const putRes = await fetch(sig.url, {
            method: "PUT",
            headers: { "content-type": entry.file.type || "application/pdf" },
            body: entry.file,
          });
          if (!putRes.ok) throw new Error(`R2 upload failed (${putRes.status})`);
          pdfKey = sig.key;
        }

        // Step 2: Create book record
        const createRes = await fetch("/api/admin/books", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: entry.title.trim(),
            author: author.trim(),
            subject: subject.trim(),
            synopsis: synopsis.trim() || `${subject.trim()} — ${entry.title.trim()}`,
            library,
            pdfKey,
          }),
        });
        const createBody = await createRes.text();
        const createdBook = JSON.parse(createBody) as {
          id?: string;
          error?: string;
        };
        if (!createRes.ok || !createdBook.id) {
          throw new Error(createdBook.error || `Create failed (${createRes.status})`);
        }

        setBooks((prev) =>
          prev.map((b, idx) =>
            idx === i ? { ...b, status: "done" as const } : b
          )
        );
        created++;
      } catch (e) {
        setBooks((prev) =>
          prev.map((b, idx) =>
            idx === i
              ? { ...b, status: "error" as const, error: (e as Error).message }
              : b
          )
        );
        failed++;
      }
    }

    setBusy(false);
    if (failed === 0) {
      push({
        title: "Bulk upload complete",
        description: `${created} book${created === 1 ? "" : "s"} created.`,
      });
      router.push("/admin/books");
      router.refresh();
    } else {
      push({
        title: `Uploaded ${created}, ${failed} failed`,
        description: "Check the table for details.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Common metadata */}
      <Card>
        <CardHeader>
          <CardTitle>1. Common details</CardTitle>
          <CardDescription>
            Author, subject, and synopsis applied to every book in this batch.
            Individual titles are extracted from filenames and can be edited below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-author">Author / Writer</Label>
              <Input
                id="bulk-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Maria Silva"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-subject">Subject</Label>
              <Input
                id="bulk-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Math, Literature…"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-synopsis">Synopsis (optional — fallback if empty)</Label>
            <Textarea
              id="bulk-synopsis"
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="Leave blank to auto-generate from subject + title"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-library">Library</Label>
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
          </div>
        </CardContent>
      </Card>

      {/* Step 2: File selection */}
      <Card>
        <CardHeader>
          <CardTitle>2. Select PDF files</CardTitle>
          <CardDescription>
            Choose multiple PDF files. Titles are extracted from filenames and can
            be edited below. Max 200 MB per file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent">
            <FileUp className="h-4 w-4" />
            Choose PDF files
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="hidden"
            />
          </label>
        </CardContent>
      </Card>

      {/* Step 3: Preview & edit */}
      {books.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3. Review & edit</CardTitle>
            <CardDescription>
              {books.filter((b) => b.status === "done").length} of {books.length} uploaded
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-96 overflow-auto rounded-md border">
              <div className="min-w-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="w-24 text-right">Size</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {books.map((entry, i) => (
                    <TableRow key={`${entry.file.name}-${i}`}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeBook(i)}
                          disabled={busy}
                          aria-label={`Remove ${entry.title}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={entry.title}
                          onChange={(e) => updateTitle(i, e.target.value)}
                          className="h-8 text-sm"
                          disabled={entry.status === "done" || busy}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.file.name}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {(entry.file.size / 1024 / 1024).toFixed(1)} MB
                      </TableCell>
                      <TableCell>
                        {entry.status === "pending" && (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                        {entry.status === "uploading" && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {entry.status === "done" && (
                          <span className="text-xs text-green-600">Done</span>
                        )}
                        {entry.status === "error" && (
                          <span className="text-xs text-destructive" title={entry.error}>
                            Error
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setBooks([]);
                  setError(null);
                }}
                disabled={busy}
              >
                Clear all
              </Button>
              <Button onClick={uploadAll} disabled={busy || books.length === 0}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload {books.length} book{books.length === 1 ? "" : "s"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
