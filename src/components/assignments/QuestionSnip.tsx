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
 * Every piece of one question joined into a single picture — so a question that
 * carries on over a page break reads as one thing, with the answer-key pages
 * left out.
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
  const pieces = questionPagesOnly(urls);
  if (pieces.length === 0) return null;
  return (
    <div className={`overflow-hidden rounded-lg border border-border bg-card ${className}`}>
      {pieces.map((url) => (
        <SnipBand key={url} url={url} alt={alt} />
      ))}
    </div>
  );
}
