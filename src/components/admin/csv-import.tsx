"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Download, FileUp, Loader2 } from "lucide-react";
import type { CsvPreviewRow } from "@/lib/csv";

type Stats = { ok: number; error: number; total: number };
type CommitSummary = Record<string, number>;
type CommitResult = {
  row: number;
  email: string;
  name?: string;
  role?: string;
  classGrade?: number | null;
  status: "created" | "skipped" | "error";
  tempPassword?: string;
  error?: string;
};

export function CsvImport(): React.ReactElement {
  const { push } = useToast();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<CsvPreviewRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busyPreview, setBusyPreview] = useState(false);
  const [busyCommit, setBusyCommit] = useState(false);
  const [commitResults, setCommitResults] = useState<CommitResult[] | null>(null);
  const [commitSummary, setCommitSummary] = useState<CommitSummary | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
  }

  async function runPreview(): Promise<void> {
    if (!csv.trim()) {
      push({ title: "Paste or upload a CSV first", variant: "destructive" });
      return;
    }
    setBusyPreview(true);
    setCommitResults(null);
    try {
      const res = await fetch("/api/admin/users/bulk-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = (await res.json()) as {
        rows?: CsvPreviewRow[];
        stats?: Stats;
        error?: string;
      };
      if (!res.ok) {
        push({ title: "Preview failed", description: data.error ?? "", variant: "destructive" });
        return;
      }
      setPreview(data.rows ?? []);
      setStats(data.stats ?? null);
    } finally {
      setBusyPreview(false);
    }
  }

  async function commit(): Promise<void> {
    if (!preview) return;
    setBusyCommit(true);
    try {
      const res = await fetch("/api/admin/users/bulk-commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: preview }),
      });
      const data = (await res.json()) as {
        results?: CommitResult[];
        summary?: CommitSummary;
        error?: string;
      };
      if (!res.ok) {
        push({ title: "Commit failed", description: data.error ?? "", variant: "destructive" });
        return;
      }
      setCommitResults(data.results ?? []);
      setCommitSummary(data.summary ?? null);
      push({
        title: "Import done",
        description: `${data.summary?.created ?? 0} created, ${data.summary?.skipped ?? 0} skipped`,
      });
    } finally {
      setBusyCommit(false);
    }
  }

  function downloadCredentials(): void {
    if (!commitResults) return;
    const lines = ["name,email,role,class,temp_password"];
    for (const r of commitResults) {
      if (r.status !== "created") continue;
      lines.push(
        [
          csvEscape(r.name ?? ""),
          csvEscape(r.email),
          csvEscape(r.role ?? ""),
          r.classGrade ? String(r.classGrade) : "",
          csvEscape(r.tempPassword ?? ""),
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "credentials.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Upload or paste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Columns: <code>name,email,role,class</code>. <code>class</code> is
            required only for students (6–12).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
              <FileUp className="h-4 w-4" />
              Choose CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={onFile}
                className="hidden"
              />
            </label>
            <Button variant="outline" size="sm" onClick={runPreview} disabled={busyPreview || !csv}>
              {busyPreview ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Preview
            </Button>
          </div>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="name,email,role,class&#10;Aisha Khan,aisha@school,STUDENT,6&#10;Mr. Singh,singh@school,TEACHER,"
            rows={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
          />
        </CardContent>
      </Card>

      {stats && preview && (
        <Card>
          <CardHeader>
            <CardTitle>2. Preview</CardTitle>
            <p className="text-sm text-muted-foreground">
              {stats.ok} OK · {stats.error} with errors · {stats.total} total
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r) => (
                    <TableRow key={`${r.row}-${r.email}`}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.email}</TableCell>
                      <TableCell>{r.role}</TableCell>
                      <TableCell>{r.classGrade ?? "—"}</TableCell>
                      <TableCell>
                        {r.status === "ok" ? (
                          <Badge variant="secondary">OK</Badge>
                        ) : (
                          <div className="space-y-1">
                            <Badge variant="destructive">Error</Badge>
                            {r.errors.length > 0 && (
                              <ul className="text-xs text-destructive">
                                {r.errors.map((e, i) => (
                                  <li key={i}>· {e}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end">
              <Button onClick={commit} disabled={busyCommit || stats.ok === 0}>
                {busyCommit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Import {stats.ok} user{stats.ok === 1 ? "" : "s"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {commitResults && (
        <Card>
          <CardHeader>
            <CardTitle>3. Results</CardTitle>
            <p className="text-sm text-muted-foreground">
              {commitSummary?.created ?? 0} created ·{" "}
              {commitSummary?.skipped ?? 0} skipped ·{" "}
              {commitSummary?.error ?? 0} errors
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Temp password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commitResults.map((r) => (
                    <TableRow key={`${r.row}-${r.email}`}>
                      <TableCell className="font-mono text-xs">{r.email}</TableCell>
                      <TableCell>{r.name ?? "—"}</TableCell>
                      <TableCell>{r.role ?? "—"}</TableCell>
                      <TableCell>{r.classGrade ?? "—"}</TableCell>
                      <TableCell>
                        {r.status === "created" ? (
                          <Badge variant="secondary">Created</Badge>
                        ) : r.status === "skipped" ? (
                          <Badge variant="outline">Skipped</Badge>
                        ) : (
                          <Badge variant="destructive">Error</Badge>
                        )}
                        {r.error && (
                          <p className="text-xs text-destructive">{r.error}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.tempPassword ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {(commitSummary?.created ?? 0) > 0 && (
              <div className="flex justify-end">
                <Button onClick={downloadCredentials}>
                  <Download className="h-4 w-4" /> Download credentials.csv
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function csvEscape(value: string): string {
  if (value == null) return "";
  const needsQuotes = /[",\n]/.test(value);
  const v = value.replace(/"/g, '""');
  return needsQuotes ? `"${v}"` : v;
}
