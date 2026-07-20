"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PdfReader } from "@/components/pdf-reader";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";

const EpubReader = dynamic(
  () => import("@/components/epub-reader").then((m) => m.EpubReader),
  { ssr: false }
);

type Props = {
  bookId: string;
  title: string;
  kind: "pdf" | "epub";
  initialPage: number;
  initialCfi: string | null;
  /** Server-resolved URL (may expire). If this fails, we re-fetch client-side. */
  serverUrl: string;
};

type UrlState =
  | { status: "ok"; url: string }
  | { status: "error"; message: string }
  | { status: "loading" };

/**
 * Wraps the PDF/EPUB reader with client-side signed-URL refresh.
 *
 * If the server-provided signed URL expires, the reader will detect the
 * failure and allow the user to click "Reload" to fetch a fresh URL from
 * `/api/files/sign` without losing their place in the UI.
 */
export function ReaderWithRefresh({
  bookId,
  title,
  kind,
  initialPage,
  initialCfi,
  serverUrl,
}: Props): React.ReactElement {
  const [urlState, setUrlState] = useState<UrlState>({
    status: "ok",
    url: serverUrl,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const reportedExpiry = useRef(false);

  /** Fetch a fresh signed URL from the server. */
  const refreshUrl = useCallback(async () => {
    setUrlState({ status: "loading" });
    setLoadError(null);
    try {
      const res = await fetch(`/api/files/sign?bookId=${bookId}&kind=${kind}`);
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? `Server returned ${res.status}`);
      }
      setUrlState({ status: "ok", url: data.url });
    } catch (e) {
      setUrlState({
        status: "error",
        message: (e as Error).message || "Could not refresh link",
      });
    }
  }, [bookId, kind]);

  /** Called when the reader component encounters a load error. */
  const handleReaderError = useCallback(
    (errorMessage: string) => {
      setLoadError(errorMessage);
      // Report the render failure to admin dashboard once per session.
      if (!reportedExpiry.current) {
        reportedExpiry.current = true;
        fetch("/api/admin/render-errors", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            bookId,
            kind,
            error: errorMessage.slice(0, 500),
          }),
        }).catch(() => {});
      }
    },
    [bookId, kind]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Error banner — shown when the signed URL has expired */}
      {loadError && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800/30 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {loadError.includes("expired") || loadError.includes("403")
                ? "This link has expired."
                : `Could not load file: ${loadError}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-amber-600 dark:text-amber-400 sm:inline">
              Click reload to get a fresh link
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={refreshUrl}
              disabled={urlState.status === "loading"}
              className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
            >
              {urlState.status === "loading" ? (
                <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              Reload
            </Button>
          </div>
        </div>
      )}

      {/* URL fetch error (not reader error — failed to get a fresh URL) */}
      {urlState.status === "error" && (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <p className="mb-2 text-sm text-destructive">{urlState.message}</p>
            <Button variant="outline" onClick={refreshUrl}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* Loading spinner while fetching fresh URL */}
      {urlState.status === "loading" && !loadError && (
        <div className="flex flex-1 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Reader */}
      {urlState.status === "ok" && (
        <div className="flex flex-1 flex-col">
          {kind === "pdf" ? (
            <PdfReader
              bookId={bookId}
              url={urlState.url}
              title={title}
              initialPage={initialPage}
              onError={handleReaderError}
            />
          ) : (
            <EpubReader
              bookId={bookId}
              url={urlState.url}
              initialCfi={initialCfi}
              onError={handleReaderError}
            />
          )}
        </div>
      )}
    </div>
  );
}
