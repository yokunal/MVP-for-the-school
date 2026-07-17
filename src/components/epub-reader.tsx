"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Minus, Plus, BookOpen } from "lucide-react";

type Props = {
  bookId: string;
  url: string;
  initialCfi: string | null;
};

export function EpubReader({ bookId, url, initialCfi }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  const [fontSize, setFontSize] = useState<number>(100);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedCfi = useRef<string | null>(initialCfi);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let book: any = null;
    let rendition: any = null;

    (async () => {
      try {
        const ePub = (await import("epubjs")).default;
        if (cancelled || !containerRef.current) return;
        book = ePub(url);
        bookRef.current = book;
        rendition = book.renderTo(containerRef.current, {
          width: "100%",
          height: "100%",
          spread: false,
          flow: "paginated",
        });
        renditionRef.current = rendition;
        await book.ready;
        if (cancelled) return;
        rendition.themes.fontSize(`${fontSize}%`);
        await rendition.display(initialCfi || undefined);
        if (!cancelled) setReady(true);

        // Persist location on each relocate (debounced).
        rendition.on("relocated", (loc: any) => {
          const cfi = loc?.start?.cfi;
          if (!cfi) return;
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(async () => {
            if (cfi === lastSavedCfi.current) return;
            lastSavedCfi.current = cfi;
            try {
              await fetch(`/api/reading-progress/${bookId}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ location: cfi }),
              });
            } catch {
              /* ignore */
            }
          }, 600);
        });
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || "Could not load EPUB");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        renditionRef.current?.destroy?.();
      } catch {}
      try {
        bookRef.current?.destroy?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    renditionRef.current?.themes?.fontSize(`${fontSize}%`);
  }, [fontSize]);

  // Persist on unload
  useEffect(() => {
    const handler = () => {
      const cfi = lastSavedCfi.current;
      if (!cfi) return;
      navigator.sendBeacon?.(
        `/api/reading-progress/${bookId}`,
        new Blob([JSON.stringify({ location: cfi })], {
          type: "application/json",
        })
      );
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [bookId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2 text-sm">
          <BookOpen className="h-4 w-4" /> EPUB
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => renditionRef.current?.prev?.()}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => renditionRef.current?.next?.()}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="mx-2 hidden h-4 w-px bg-border sm:inline-block" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFontSize((v) => Math.max(70, v - 10))}
            aria-label="Smaller text"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums">{fontSize}%</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFontSize((v) => Math.min(200, v + 10))}
            aria-label="Larger text"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <a
            href={`/books/${bookId}`}
            className="ml-3 text-xs text-muted-foreground hover:underline"
          >
            Back to book
          </a>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden bg-muted/30">
        <div ref={containerRef} className="absolute inset-0" />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
        {error && (
          <div className="absolute inset-x-4 top-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
