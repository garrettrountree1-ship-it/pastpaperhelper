import { useEffect, useState } from "react";

import { questionPagesOnly } from "@/lib/answer-key";
import { snapBandToWhitespace } from "@/lib/snip-whitespace";

/**
 * Shows a question exactly as printed on the past-paper page.
 *
 * A stored page path can carry "#crop=top,bottom" (fractions of the page
 * height), so the student sees only the band holding that question — its
 * wording, options, tables and diagrams — never a re-typed version of it.
 * Cut lines are nudged onto blank paper so words and diagrams stay whole, and
 * a question that runs over a page break is joined into one picture.
 * The picture cannot be selected, dragged or right-click saved.
 */
export function parseSnipBand(url: string): { top: number; bottom: number } | null {
  const at = url.indexOf("#crop=");
  if (at === -1) return null;
  const parts = url.slice(at + 6).split(",");
  const top = Number(parts[0]);
  const bottom = Number(parts[1]);
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  if (bottom <= top) return null;
  return { top: Math.max(0, top), bottom: Math.min(1, bottom) };
}

const guard = {
  draggable: false,
  onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  onDragStart: (event: React.DragEvent) => event.preventDefault(),
} as const;

/** One band of one page, cut only where the paper is empty. */
function SnipBand({ url, alt }: { url: string; alt: string }) {
  const raw = parseSnipBand(url);
  const [band, setBand] = useState(raw);
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!raw) return;
    let live = true;
    void snapBandToWhitespace(url, raw).then((tidy) => {
      if (live) setBand(tidy);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (!band) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        {...guard}
        className="pointer-events-none block w-full select-none object-contain"
      />
    );
  }

  const height = band.bottom - band.top;
  // Page shape until the picture loads: assume A4 so the box does not jump.
  const pageRatio = ratio ?? 1 / 1.414;

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: `${pageRatio / height}` }}
    >
      <img
        src={url}
        alt={alt}
        loading="lazy"
        {...guard}
        onLoad={(event) => {
          const image = event.currentTarget;
          if (image.naturalWidth && image.naturalHeight) {
            setRatio(image.naturalWidth / image.naturalHeight);
          }
        }}
        className="pointer-events-none absolute left-0 top-0 w-full max-w-none select-none"
        style={{ transform: `translateY(${-band.top * 100}%)` }}
      />
    </div>
  );
}

export function QuestionSnip({
  url,
  alt = "Question as printed on the original paper",
  className = "",
}: {
  url: string;
  alt?: string;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-lg border border-border bg-card ${className}`}>
      <SnipBand url={url} alt={alt} />
    </div>
  );
}

/**
 * Joins overlapping pieces of the same page into one.
 *
 * The reading step sometimes reports two bands for the same page that cover
 * much of the same print (e.g. 0.10-0.40 and 0.12-0.45). Shown one under the
 * other, the student saw the same question twice. Pieces of one page are now
 * merged into a single band, and a piece already contained in another is
 * dropped.
 */
export function mergeSnipPieces(urls: string[]): string[] {
  const out: string[] = [];
  const bands: Array<{ page: string; top: number; bottom: number }> = [];

  for (const url of urls) {
    const band = parseSnipBand(url);
    const page = url.slice(0, url.indexOf("#crop=") === -1 ? undefined : url.indexOf("#crop="));
    if (!band) {
      // A whole page: only once, and never alongside bands of that same page.
      if (!out.includes(url)) out.push(url);
      continue;
    }
    const existing = bands.find(
      (piece) =>
        piece.page === page &&
        band.top < piece.bottom + 0.02 &&
        band.bottom > piece.top - 0.02,
    );
    if (existing) {
      existing.top = Math.min(existing.top, band.top);
      existing.bottom = Math.max(existing.bottom, band.bottom);
      continue;
    }
    bands.push({ page, top: band.top, bottom: band.bottom });
  }

  for (const piece of bands) {
    out.push(`${piece.page}#crop=${piece.top.toFixed(4)},${piece.bottom.toFixed(4)}`);
  }
  return out;
}

/**
 * Every piece of one question joined into a single picture — so a question that
 * carries on over a page break reads as one thing, with the answer-key pages
 * left out and no piece repeated.
 */
export function QuestionSnipStack({
  urls,
  alt = "Question as printed on the original paper",
  className = "",
}: {
  urls: string[];
  alt?: string;
  className?: string;
}) {
  const pieces = mergeSnipPieces(questionPagesOnly(urls));
  if (pieces.length === 0) return null;
  return (
    <div className={`overflow-hidden rounded-lg border border-border bg-card ${className}`}>
      {pieces.map((url) => (
        <SnipBand key={url} url={url} alt={alt} />
      ))}
    </div>
  );
}

