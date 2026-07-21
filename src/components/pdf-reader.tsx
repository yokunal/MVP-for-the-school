"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import * as pdfjs from "pdfjs-dist";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Minus, Plus } from "lucide-react";

type Props = {
  bookId: string;
  url: string;
  title: string;
  initialPage: number;
  onError?: (message: string) => void;
};

type PageSize = { w: number; h: number };

// ---------------------------------------------------------------------------
// Adaptive performance settings
// ---------------------------------------------------------------------------

const SCALE_MIN = 0.25;
const SCALE_MAX = 5;
const SCALE_STEP = 0.1;
const PROGRESS_DEBOUNCE_MS = 900;

/** Detect low-memory device (Chromebooks, budget tablets). */
function isLowMemoryDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  // navigator.deviceMemory is non-standard but supported in Chrome/Chromium
  return (navigator as any).deviceMemory !== undefined && (navigator as any).deviceMemory < 4;
}

/** Cap effective DPR so low-mem devices don't render 4× the pixels. */
function getEffectiveDpr(): number {
  const raw = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return isLowMemoryDevice() ? Math.min(raw, 1.5) : raw;
}

// Adaptive render window — fewer pages kept rendered on low-end devices.
const RENDER_WINDOW_BCK = isLowMemoryDevice() ? 2 : 4;
const RENDER_WINDOW_FWD = isLowMemoryDevice() ? 4 : 8;

// Pad the intersection observer so off-screen-but-near pages also fire entries.
const NEAR_VIEWPORT_FRACTION = 1.5;

// Tracks whether the pdf.js web worker has been initialised (lazy, on first mount).
let workerInitialised = false;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function getDpr(): number {
  if (typeof window === "undefined") return 1;
  return getEffectiveDpr();
}

export function PdfReader({
  bookId,
  url,
  title,
  initialPage,
  onError,
}: Props): React.ReactElement {
  // ---- document + per-page intrinsic sizes ----
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageSizes, setPageSizes] = useState<Map<number, PageSize>>(new Map());
  const [docError, setDocError] = useState<string | null>(null);

  // ---- visual state ----
  const [scale, setScaleState] = useState(1);
  const [dpr, setDpr] = useState<number>(() => getDpr());

  // ---- layout ----
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [containerReady, setContainerReady] = useState(false);

  // ---- reader state ----
  const [currentPage, setCurrentPage] = useState(0); // 0 = not yet resolved
  const [progressRestored, setProgressRestored] = useState(initialPage <= 1);

  // ---- refs ----
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderedPages = useRef<Set<number>>(new Set());
  const inflightPages = useRef<Set<number>>(new Set());
  const renderTasks = useRef<Map<number, RenderTask>>(new Map());
  const pageRenderKey = useRef<Map<number, string>>(new Map());

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomAnchor = useRef<{ pageNum: number; ratio: number } | null>(null);
  const lastSavedPageRef = useRef<number>(0);
  const lastDprString = useRef<string>("");

  // Combined key used to decide whether a previously-rendered canvas is
  // still valid for the current zoom + DPR.
  const renderKey = useMemo(
    () => `s=${scale.toFixed(3)}|dpr=${dpr.toFixed(3)}`,
    [scale, dpr]
  );

  // -------- 0. Initialise pdf.js web worker (lazy, on first mount) --------
  useEffect(() => {
    if (!workerInitialised) {
      workerInitialised = true;
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }
  }, []);

  // -------- 1. Load PDF + measure every page's intrinsic size --------
  useEffect(() => {
    let cancelled = false;
    let acquired: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const task = pdfjs.getDocument({ url, disableAutoFetch: true });
        const pdf = (await task.promise) as PDFDocumentProxy;
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        acquired = pdf;

        // Measure all pages in parallel for snappy open; pages stay in pdf.js's
        // internal cache so re-rendering them later is cheap.
        const proxies = await Promise.all(
          Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1))
        );
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        const sizes = new Map<number, PageSize>();
        for (let i = 0; i < proxies.length; i++) {
          const vp = proxies[i].getViewport({ scale: 1 });
          sizes.set(i + 1, { w: vp.width, h: vp.height });
        }
        if (cancelled) return;
        setDoc(pdf);
        setNumPages(pdf.numPages);
        setPageSizes(sizes);
      } catch (e) {
        if (!cancelled) {
          const msg = (e as Error).message || "Could not load PDF";
          setDocError(msg);
          onError?.(msg);
        }
        try {
          await acquired?.destroy();
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // -------- 2. Destroy the doc on unmount (or when url changes) --------
  useEffect(() => {
    return () => {
      // Cancel any in-flight pdf.js render tasks
      renderTasks.current.forEach((t) => {
        try {
          t.cancel();
        } catch {
          /* ignore */
        }
      });
      renderTasks.current.clear();
      // Then drop the document (the captured `doc` is the latest since deps include it)
    };
    // We re-bind to `doc` so a reload destroys the old document.
  }, [doc]);

  useEffect(() => {
    return () => {
      doc?.destroy().catch(() => {});
    };
  }, [doc]);

  // -------- 3. Track scroll-container width (ResizeObserver) --------
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = (w: number) => {
      if (w > 0) {
        setContainerWidth(w);
        if (!containerReady) setContainerReady(true);
      }
    };
    update(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        update(e.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // We don't need to depend on containerReady (we set it once).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------- 4. Track DPR via matchMedia so re-renders happen when zoom/OS changes --------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const initial = `${getDpr()}`;
    lastDprString.current = initial;
    const mql = window.matchMedia(`(resolution: ${initial}dppx)`);
    const onChange = () => {
      const next = getDpr().toString();
      if (next !== lastDprString.current) {
        lastDprString.current = next;
        setDpr(getDpr());
      }
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // -------- 5. Fit-width scale (memo) --------
  const fitScale = useMemo(() => {
    if (pageSizes.size === 0 || containerWidth <= 0) return 1;
    let maxW = 0;
    for (const s of pageSizes.values()) if (s.w > maxW) maxW = s.w;
    // 32-px gutter so the page doesn't kiss the scroll container's edge.
    const target = Math.max(1, containerWidth - 32);
    return target / maxW;
  }, [pageSizes, containerWidth]);

  // -------- 6. Scale-change handler that captures the visual anchor --------
  const setScaleWithAnchor = useCallback(
    (nextScale: number) => {
      const scroller = scrollerRef.current;
      const clamped = clamp(nextScale, SCALE_MIN, SCALE_MAX);
      if (!scroller || pageRefs.current.size === 0) {
        setScaleState(clamped);
        return;
      }
      const scrollTop = scroller.scrollTop;
      const viewportMid = scrollTop + scroller.clientHeight / 2;
      const candidates: Array<{ num: number; ratio: number; dist: number }> = [];
      pageRefs.current.forEach((el, num) => {
        if (!el) return;
        const top = el.offsetTop;
        const bot = top + el.offsetHeight;
        const mid = (top + bot) / 2;
        const d = Math.abs(mid - viewportMid);
        const frac = clamp((viewportMid - top) / el.offsetHeight, 0, 1);
        candidates.push({ num, ratio: frac, dist: d });
      });
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.dist - b.dist);
        const winner = candidates[0];
        zoomAnchor.current = { pageNum: winner.num, ratio: winner.ratio };
      }
      setScaleState(clamped);
    },
    // numPages is implicit through pageRefs.current — but we want a stable handler.
    // pageSizes not needed for ratio (uses current DOM measurements).
    []
  );

  // -------- 7. After scale (or pageSizes) change, restore the anchor scroll --------
  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    if (!anchor) return;
    const scroller = scrollerRef.current;
    const el = pageRefs.current.get(anchor.pageNum);
    if (!scroller || !el) return;
    // After this layout effect el.offsetTop / offsetHeight reflect the new scale.
    const target =
      el.offsetTop +
      el.offsetHeight * anchor.ratio -
      scroller.clientHeight * anchor.ratio;
    scroller.scrollTop = Math.max(0, target);
    zoomAnchor.current = null;
  }, [scale, pageSizes]);

  // -------- 8. Invalidate rendered canvases when scale or DPR changes --------
  useEffect(() => {
    // Cancel in-flight renders & clear every canvas.
    renderTasks.current.forEach((t) => {
      try {
        t.cancel();
      } catch {
        /* ignore */
      }
    });
    renderTasks.current.clear();
    inflightPages.current.clear();
    pageRenderKey.current.clear();
    renderedPages.current.clear();
    canvasRefs.current.forEach((c) => {
      c.width = 0;
      c.height = 0;
    });
    pageRefs.current.forEach((el) => el.removeAttribute("data-render-error"));
  }, [renderKey]);

  // -------- 9. Initial scroll-to-saved-page once layout is laid out --------
  useLayoutEffect(() => {
    if (progressRestored) return;
    if (numPages === 0 || !containerReady) return;
    const target = clamp(initialPage || 1, 1, numPages);
    // Two RAFs ensure layout has settled (placeholders just got sized).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = pageRefs.current.get(target);
        if (el) {
          scrollerRef.current?.scrollTo({
            top: el.offsetTop,
            behavior: "instant" as ScrollBehavior,
          });
        }
        setProgressRestored(true);
      })
    );
  }, [progressRestored, numPages, containerReady, initialPage]);

  // -------- 10. Render a single page (idempotent + cancellable) --------
  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!doc) return;
      // Skip if already rendered at this key.
      if (
        renderedPages.current.has(pageNum) &&
        pageRenderKey.current.get(pageNum) === renderKey
      ) {
        return;
      }
      if (inflightPages.current.has(pageNum)) return;
      const canvas = canvasRefs.current.get(pageNum);
      const placeholder = pageRefs.current.get(pageNum);
      const base = pageSizes.get(pageNum);
      if (!canvas || !placeholder || !base) return;

      inflightPages.current.add(pageNum);
      placeholder.removeAttribute("data-render-error");
      try {
        const page: PDFPageProxy = await doc.getPage(pageNum);
        // Bail if another render invalidated this key while we awaited.
        if (
          renderedPages.current.has(pageNum) &&
          pageRenderKey.current.get(pageNum) === renderKey
        ) {
          return;
        }

        // Pre-cancel any surviving render task for this page (race safety).
        const prev = renderTasks.current.get(pageNum);
        if (prev) {
          try {
            prev.cancel();
          } catch {
            /* ignore */
          }
        }

        const renderScale = scale * dpr;
        const renderVp = page.getViewport({ scale: renderScale });
        const displayW = base.w * scale;
        const displayH = base.h * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Sharp render: backing pixels at scale*dpr, display size at scale.
        canvas.width = renderVp.width;
        canvas.height = renderVp.height;
        canvas.style.width = `${displayW}px`;
        canvas.style.height = `${displayH}px`;

        const task = page.render({
          canvasContext: ctx,
          viewport: renderVp,
          intent: "display",
        }) as RenderTask;
        renderTasks.current.set(pageNum, task);
        await task.promise;

        // Final guard — if the key changed mid-render, throw away the result
        // by leaving `renderedPages` empty for this page.
        if (
          (pageRenderKey.current.get(pageNum) ?? "") === renderKey &&
          renderedPages.current.has(pageNum)
        ) {
          return;
        }
        pageRenderKey.current.set(pageNum, renderKey);
        renderedPages.current.add(pageNum);
      } catch (e) {
        if (!(e instanceof pdfjs.RenderingCancelledException)) {
          placeholder.setAttribute(
            "data-render-error",
            (e as Error)?.message || "render failed"
          );
        }
      } finally {
        inflightPages.current.delete(pageNum);
        renderTasks.current.delete(pageNum);
        // Force a re-paint of this placeholder so the skeleton hides.
        placeholder.dispatchEvent(new Event("rendered"));
      }
    },
    [doc, pageSizes, scale, dpr, renderKey]
  );

  // -------- 11. IntersectionObserver: pick currentPage + trigger renders --------
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || numPages === 0 || !containerReady) return;
    const visible = new Map<number, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const num = Number(
            (entry.target as HTMLElement).dataset.pageNumber
          );
          if (!Number.isFinite(num)) continue;
          if (entry.isIntersecting) {
            visible.set(num, entry.intersectionRatio);
            if (!renderedPages.current.has(num)) {
              void renderPage(num);
            }
          } else {
            visible.delete(num);
          }
        }
        if (visible.size > 0) {
          const ranked: Array<{
            num: number;
            ratio: number;
            dist: number;
          }> = [];
          visible.forEach((ratio, num) => {
            const el = pageRefs.current.get(num);
            if (!el) return;
            const top = el.offsetTop;
            const bot = top + el.offsetHeight;
            const scMid = scroller.scrollTop + scroller.clientHeight / 2;
            const mid = (top + bot) / 2;
            const dist = Math.abs(mid - scMid);
            ranked.push({ num, ratio, dist });
          });
          ranked.sort((a, b) => {
            const ratioDelta = b.ratio - a.ratio;
            if (Math.abs(ratioDelta) > 0.001) return ratioDelta;
            return a.dist - b.dist;
          });
          const winner = ranked[0];
          if (winner && winner.num !== currentPage) setCurrentPage(winner.num);
        }
      },
      {
        root: scroller,
        // Pad so we hear about pages just off-screen too — used to render them
        // before they pop into the viewport.
        rootMargin: `${Math.round(NEAR_VIEWPORT_FRACTION * 100)}%`,
        threshold: [0, 0.25, 0.5, 0.75, 1.0],
      }
    );

    pageRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [numPages, containerReady, renderPage, currentPage]);

  // -------- 12. Drop rendered canvases for pages outside the read window --------
  useEffect(() => {
    if (currentPage <= 0) return;
    const keep = (n: number) =>
      n >= currentPage - RENDER_WINDOW_BCK && n <= currentPage + RENDER_WINDOW_FWD;
    canvasRefs.current.forEach((c, n) => {
      if (renderedPages.current.has(n) && !keep(n)) {
        const t = renderTasks.current.get(n);
        if (t) {
          try {
            t.cancel();
          } catch {
            /* ignore */
          }
          renderTasks.current.delete(n);
        }
        c.width = 0;
        c.height = 0;
        renderedPages.current.delete(n);
        pageRenderKey.current.delete(n);
      } else if (!renderedPages.current.has(n) && keep(n)) {
        void renderPage(n);
      }
    });
  }, [currentPage, renderPage]);

  // -------- 13. Persist currentPage (debounced) --------
  useEffect(() => {
    if (currentPage <= 0 || currentPage === lastSavedPageRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const pageToSave = currentPage;
    saveTimer.current = setTimeout(() => {
      if (pageToSave === lastSavedPageRef.current) return;
      lastSavedPageRef.current = pageToSave;
      void fetch(`/api/reading-progress/${bookId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ location: String(pageToSave) }),
      }).catch(() => {
        /* best-effort — we'll re-save on the next change */
      });
    }, PROGRESS_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [currentPage, bookId]);

  // sendBeacon on unload
  useEffect(() => {
    const handler = () => {
      const cp = currentPage;
      if (!cp) return;
      const body = new Blob([JSON.stringify({ location: String(cp) })], {
        type: "application/json",
      });
      navigator.sendBeacon?.(`/api/reading-progress/${bookId}`, body);
    };
    window.addEventListener("beforeunload", handler);
    document.addEventListener("visibilitychange", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      document.removeEventListener("visibilitychange", handler);
    };
  }, [currentPage, bookId]);

  // -------- 14. Toolbar actions + keyboard shortcuts --------
  const zoomIn = useCallback(() => setScaleWithAnchor(scale + SCALE_STEP), [
    scale,
    setScaleWithAnchor,
  ]);
  const zoomOut = useCallback(() => setScaleWithAnchor(scale - SCALE_STEP), [
    scale,
    setScaleWithAnchor,
  ]);
  const fitWidth = useCallback(() => {
    setScaleWithAnchor(fitScale);
  }, [fitScale, setScaleWithAnchor]);

  const goToPage = useCallback(
    (n: number) => {
      if (numPages === 0) return;
      const target = clamp(Math.round(n), 1, numPages);
      requestAnimationFrame(() => {
        pageRefs.current.get(target)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    },
    [numPages]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          if (currentPage > 1) goToPage(currentPage - 1);
          break;
        case "ArrowRight":
        case "PageDown":
        case " ":
          e.preventDefault();
          if (currentPage > 0 && currentPage < numPages)
            goToPage(currentPage + 1);
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
        case "_":
          e.preventDefault();
          zoomOut();
          break;
        case "0":
          e.preventDefault();
          fitWidth();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentPage, numPages, zoomIn, zoomOut, fitWidth, goToPage]);

  // -------- 15. Render --------

  const showInitialSpinner = numPages === 0 && !docError;

  return (
    <div className="flex h-full flex-col bg-background">
      <Toolbar
        title={title}
        currentPage={currentPage}
        numPages={numPages}
        scale={scale}
        bookId={bookId}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitWidth={fitWidth}
        onGoToPage={goToPage}
        atMin={scale <= SCALE_MIN + 1e-6}
        atMax={scale >= SCALE_MAX - 1e-6}
      />

      <div
        ref={scrollerRef}
        className="relative flex-1 overflow-auto bg-muted/30"
        tabIndex={0}
      >
        {docError && (
          <div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {docError}
          </div>
        )}

        {showInitialSpinner && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background/60 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-sm">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground/80" />
              Loading PDF…
            </div>
          </div>
        )}

        {numPages > 0 && (
          <div className="flex flex-col items-center gap-1 py-3">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
              const size = pageSizes.get(n)!;
              const w = size.w * scale;
              const h = size.h * scale;
              const rendered = renderedPages.current.has(n);
              const renderError =
                pageRefs.current.get(n)?.getAttribute("data-render-error") ??
                null;
              return (
                <div
                  key={n}
                  ref={(el) => {
                    if (el) pageRefs.current.set(n, el);
                    else pageRefs.current.delete(n);
                  }}
                  data-page-number={n}
                  className="page-placeholder relative bg-white shadow-md ring-1 ring-border/40 dark:bg-zinc-50"
                  style={{
                    width: `${w}px`,
                    height: `${h}px`,
                    borderRadius: 2,
                  }}
                >
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current.set(n, el);
                      else canvasRefs.current.delete(n);
                    }}
                    data-page={n}
                    className="absolute inset-0 block"
                    aria-label={`Page ${n}`}
                  />
                  {!rendered && !renderError && (
                    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-muted/40">
                      <div className="flex items-center gap-2 rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground/80" />
                        Loading page {n}…
                      </div>
                    </div>
                  )}
                  {renderError && (
                    <div className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-destructive">
                      Could not render page {n}: {renderError}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type ToolbarProps = {
  title: string;
  currentPage: number;
  numPages: number;
  scale: number;
  bookId: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onGoToPage: (n: number) => void;
  atMin: boolean;
  atMax: boolean;
};

function Toolbar({
  title,
  currentPage,
  numPages,
  scale,
  bookId,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onGoToPage,
  atMin,
  atMax,
}: ToolbarProps): React.ReactElement {
  const [jumpTo, setJumpTo] = useState("");
  const [jumpFocused, setJumpFocused] = useState(false);
  // While the jump input is focused we don't overwrite its value with
  // currentPage, so the user can type without us yanking it back.
  useEffect(() => {
    if (!jumpFocused && currentPage > 0) setJumpTo(String(currentPage));
  }, [currentPage, jumpFocused]);

  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-1 border-b bg-background/95 px-2 py-1.5 backdrop-blur sm:gap-2 sm:px-3 sm:py-2">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/books/${bookId}`}>
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </Link>
      </Button>

      <span className="hidden max-w-[40ch] truncate text-sm font-medium md:inline">
        {title}
      </span>

      <div className="flex flex-1 items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={onZoomOut}
          aria-label="Zoom out"
          disabled={atMin}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span
          className="w-10 text-center text-xs tabular-nums sm:w-14"
          aria-label="Zoom level"
        >
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={onZoomIn}
          aria-label="Zoom in"
          disabled={atMax}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onFitWidth}
          className="hidden sm:inline-flex"
          aria-label="Fit width"
        >
          Fit width
        </Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseInt(jumpTo, 10);
          if (Number.isFinite(n)) onGoToPage(n);
          (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur();
        }}
        className="flex items-center gap-2 text-sm tabular-nums"
      >
        <span className="hidden sm:inline">Page</span>
        <input
          value={jumpTo}
          onChange={(e) => setJumpTo(e.target.value)}
          onFocus={() => setJumpFocused(true)}
          onBlur={() => {
            setJumpFocused(false);
            const n = parseInt(jumpTo, 10);
            if (Number.isFinite(n)) onGoToPage(n);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          type="number"
          min={1}
          max={numPages || undefined}
          aria-label="Jump to page"
          className="h-9 w-12 rounded-md border border-input bg-background px-1 py-1 text-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:w-16 sm:px-2"
        />
        <span className="text-xs text-muted-foreground">
          / {numPages || "—"}
        </span>
      </form>
    </div>
  );
}
