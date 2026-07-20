"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Props = {
  bookId: string;
  bookTitle: string;
};

export function DeleteBookButton({ bookId, bookTitle }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleDelete(): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/books/${bookId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        alert(data.error || "Could not delete book.");
        return;
      }
      router.refresh();
    } catch {
      alert("Network error. Could not delete book.");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-background p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">Delete book</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Are you sure? This cannot be undone.
              <br />
              <span className="font-medium text-foreground">{bookTitle}</span> will be
              permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={handleDelete}
              >
                {busy ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
