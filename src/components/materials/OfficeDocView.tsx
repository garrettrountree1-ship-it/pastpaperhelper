import { Download, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { parsePptx, type PptxDeck } from "@/lib/pptx-render";

/**
 * Renders .pptx slide decks and .docx documents inline so they simply scroll in
 * the pane, exactly like the PDF viewer. Slides are drawn one under the other;
 * Word files become flowing HTML.
 */
export function OfficeDocView({
  url,
  title,
  format,
}: {
  url: string;
  title: string;
  format: "pptx" | "docx";
}) {
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [html, setHtml] = useState<string>("");
  const [deck, setDeck] = useState<PptxDeck | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setHtml("");
    setDeck(null);

    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed (${response.status})`);
        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        if (format === "docx") {
          const mammoth = await import("mammoth/mammoth.browser.js");
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (cancelled) return;
          setHtml(result.value);
        } else {
          const parsed = await parsePptx(buffer);
          if (cancelled) return;
          setDeck(parsed);
        }
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, format]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 pb-1">
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          aria-label="Zoom out document"
          onClick={() => setZoom((v) => Math.max(0.5, Number((v - 0.1).toFixed(2))))}
        >
          <Minus className="size-3.5" />
        </Button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="min-w-11 rounded px-1 text-xs text-muted-foreground hover:bg-muted"
          aria-label="Reset document zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          aria-label="Zoom in document"
          onClick={() => setZoom((v) => Math.min(3, Number((v + 0.1).toFixed(2))))}
        >
          <Plus className="size-3.5" />
        </Button>
        {deck ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {deck.slides.length} slide{deck.slides.length === 1 ? "" : "s"}
          </span>
        ) : null}
        {canDownload === false ? null : (
        <Button asChild size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs">
          <a href={url} download={title} target="_blank" rel="noreferrer">
            <Download className="size-3.5" />
            Download
          </a>
        </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md bg-muted/30 p-2">
        {status === "loading" ? (
          <div className="space-y-2 p-2">
            <p className="text-sm text-muted-foreground">
              Preparing {format === "pptx" ? "slides" : "document"}… large files can take a few
              seconds the first time.
            </p>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : null}
        {status === "failed" ? (
          <p className="p-4 text-sm text-muted-foreground">
            This file couldn&apos;t be displayed inline. Use Download to open it, or upload a PDF
            version for in-app scrolling.
          </p>
        ) : null}

        {status === "ready" ? (
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              width: `${100 / zoom}%`,
            }}
          >
            {deck ? (
              <div className="office-slides space-y-3">
                {deck.slides.map((slide, index) => (
                  <SlidePage key={index} deck={deck} index={index} />
                ))}
              </div>
            ) : (
              <div
                className="office-doc rounded-md border bg-white p-6 text-sm leading-relaxed text-black shadow-sm"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SlidePage({ deck, index }: { deck: PptxDeck; index: number }) {
  const slide = deck.slides[index];
  if (!slide) return null;
  return (
    <div className="relative overflow-hidden rounded-md border bg-white shadow-sm">
      <div
        className="relative origin-top-left"
        style={{ width: "100%", aspectRatio: `${deck.width} / ${deck.height}` }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: deck.width,
            height: deck.height,
            transform: "scale(var(--slide-scale, 1))",
            transformOrigin: "top left",
          }}
          ref={(node) => {
            if (!node) return;
            const parent = node.parentElement;
            if (!parent) return;
            const apply = () =>
              node.style.setProperty("--slide-scale", String(parent.clientWidth / deck.width));
            apply();
            const observer = new ResizeObserver(apply);
            observer.observe(parent);
          }}
        >
          {slide.shapes.map((shape, i) =>
            shape.type === "image" ? (
              <img
                key={i}
                src={shape.src}
                alt=""
                style={{
                  position: "absolute",
                  left: shape.x,
                  top: shape.y,
                  width: shape.w || undefined,
                  height: shape.h || undefined,
                  transform: shape.rot ? `rotate(${shape.rot}deg)` : undefined,
                }}
              />
            ) : (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: shape.x,
                  top: shape.y,
                  width: shape.w || undefined,
                  transform: shape.rot ? `rotate(${shape.rot}deg)` : undefined,
                  color: "#111",
                }}
              >
                {shape.paragraphs.map((paragraph, pi) => (
                  <p
                    key={pi}
                    style={{
                      textAlign:
                        paragraph.align === "ctr"
                          ? "center"
                          : paragraph.align === "r"
                            ? "right"
                            : "left",
                      margin: "0 0 4px",
                    }}
                  >
                    {paragraph.bullet ? "• " : ""}
                    {paragraph.runs.map((run, ri) => (
                      <span
                        key={ri}
                        style={{
                          fontSize: run.size,
                          lineHeight: 1.25,
                          fontWeight: run.bold ? 700 : 400,
                          fontStyle: run.italic ? "italic" : undefined,
                          textDecoration: run.underline ? "underline" : undefined,
                          color: run.color ?? undefined,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {run.text}
                      </span>
                    ))}
                  </p>
                ))}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
