// Ambient module declaration for epubjs — the published package ships JS only
// (no types). We only use a sliver of its API so a hand-rolled shape is fine.

declare module "epubjs" {
  type Cfi = string;

  interface BookOptions {
    replacements?: string;
    requestOptions?: Record<string, unknown>;
  }
  interface RenditionOptions {
    width?: string | number;
    height?: string | number;
    spread?: "auto" | "none" | boolean;
    flow?: "paginated" | "auto" | string;
    manager?: string;
    theme?: Record<string, unknown>;
  }
  interface LocatedLocation {
    start: { cfi: Cfi };
    end?: { cfi: Cfi };
  }

  interface EpubBook {
    ready: Promise<EpubBook>;
    renderTo(el: HTMLElement, opts?: RenditionOptions): EpubRendition;
    destroy(): void;
  }
  interface EpubRendition {
    display(cfi?: Cfi): Promise<unknown>;
    next(): Promise<unknown>;
    prev(): Promise<unknown>;
    destroy(): void;
    on(event: "relocated", cb: (loc: LocatedLocation) => void): void;
    themes: { fontSize: (size: string) => void };
  }

  // epubjs exports a default callable. Mark the type as a callable interface
  // so `ePub(...)` works without `new`.
  interface EpubStatic {
    (url: string, opts?: BookOptions): EpubBook;
  }
  const ePub: EpubStatic;
  export default ePub;
}
