import { useState } from "react";

/**
 * Shows a question exactly as printed on the past-paper page.
 *
 * A stored page path can carry "#crop=top,bottom" (fractions of the page
 * height), so the student sees only the band holding that question — its
 * wording, options, tables and diagrams — never a re-typed version of it.
 * The picture cannot be selected, dragged or right-click saved.
 */
export function parseSnipBand(url: string): { top: number; bottom: number } | null {
  const at = url.indexOf("#crop=");
  if (at === -1) return null;
  const [top, bottom] = url
    .slice(at + 6)
    .split(",")
    .map((n) => Number(n));
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom == null) return null;
  if (bottom <= top) return null;
  return { top: Math.max(0, top), bottom: Math.min(1, bottom) };
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
  const band = parseSnipBand(url);
  const [ratio, setRatio] = useState<number | null>(null);

  const guard = {
    draggable: false,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    onDragStart: (event: React.DragEvent) => event.preventDefault(),
  } as const;

  if (!band) {
    return (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        {...guard}
        className={`pointer-events-none w-full select-none rounded-lg border border-border bg-card object-contain ${className}`}
      />
    );
  }

  const height = band.bottom - band.top;
  // Page shape until the picture loads: assume A4 so the box does not jump.
  const pageRatio = ratio ?? 1 / 1.414;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg border border-border bg-card ${className}`}
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
