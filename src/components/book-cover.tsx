"use client";

import { useEffect, useState } from "react";

type Props = {
  src: string | null;
  alt?: string;
  className?: string;
};

/**
 * Cover image renderer. Pages resolve the signed/local URL server-side
 * (one network round-trip per page render, not per card) and pass it in.
 *
 * Renders a tinted placeholder when `src` is null.
 */
export function BookCover({
  src,
  alt = "",
  className = "",
}: Props): React.ReactElement {
  if (!src) {
    return (
      <div
        className={`flex aspect-[2/3] items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/20 text-xs uppercase tracking-widest text-muted-foreground ${className}`}
        aria-label="No cover"
      >
        No cover
      </div>
    );
  }
  // Re-fetch by proxy in case the signed URL expires while the user stays
  // on the page (PDF/EPUB readers do this; covers mostly don't need to).
  const [resolvedSrc, setResolvedSrc] = useState<string>(src);
  useEffect(() => {
    setResolvedSrc(src);
  }, [src]);
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading="lazy"
      className={`aspect-[2/3] w-full object-cover ${className}`}
    />
  );
}
