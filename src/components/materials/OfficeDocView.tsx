import { Download, Minus, Plus, RefreshCw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clearCachedDoc, readCachedJson, writeCachedJson } from "@/lib/doc-cache";
import { parsePptx, type PptxDeck, type PptxShape } from "@/lib/pptx-render";

/**
 * Renders .pptx slide decks and .docx documents inline so they simply scroll in
 * the pane, exactly like the PDF viewer. Slides are drawn one under the other;
 * Word files become flowing HTML.
 *
 * Parsed decks (and converted Word HTML) are cached in the browser under
 * `cacheKey`, so a document is only ever built once — after the first open it
 * appears immediately with no loading step.
 */
export function OfficeDocView({
  url,
  title,
  format,
  cacheKey,
  canDownload = true,
}: {
  url: string;
  title: string;
  format: "pptx" | "docx";
  cacheKey?: string;
  canDownload?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [html, setHtml] = useState<string>("");
  const [deck, setDeck] = useState<PptxDeck | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const key = `office:${format}:${cacheKey ?? title}`;

  // Zoom keeps the anchor point fixed instead of drifting the scroll position.
  const pendingScroll = useRef<{ x: number; y: number } | null>(null);

  function applyZoom(nextOf: (current: number) => number, anchor?: { x: number; y: number }) {
    setZoom((current) => {
      const next = Math.min(3, Math.max(0.5, Number(nextOf(current).toFixed(3))));
      const el = scrollRef.current;
      if (el && next !== current) {
        const ax = anchor?.x ?? el.clientWidth / 2;
        const ay = anchor?.y ?? el.clientHeight / 2;
        const k = next / current;
        pendingScroll.current = {
          x: (el.scrollLeft + ax) * k - ax,
          y: (el.scrollTop + ay) * k - ay,
        };
      }
      return next;
    });
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const target = pendingScroll.current;
    pendingScroll.current = null;
    if (!el || !target) return;
    el.scrollLeft = Math.max(0, target.x);
    el.scrollTop = Math.max(0, target.y);
  }, [zoom]);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms only this pane.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const rect = el.getBoundingClientRect();
      applyZoom((value) => value * Math.exp(-dy * 0.0015), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const run = ++token.current;
    let cancelled = false;
    setStatus("loading");
    setHtml("");
    setDeck(null);

    (async () => {
      // Cached render first: the document opens with no download or parsing.
      const cached = await readCachedJson<PptxDeck | string>(key);
      if (cancelled || run !== token.current) return;
      if (cached) {
        if (format === "pptx" && typeof cached === "object") setDeck(cached);
        else if (format === "docx" && typeof cached === "string") setHtml(cached);
        setStatus("ready");
        return;
      }

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed (${response.status})`);
        const buffer = await response.arrayBuffer();
        if (cancelled || run !== token.current) return;

        if (format === "docx") {
          const mammoth = await import("mammoth/mammoth.browser.js");
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (cancelled || run !== token.current) return;
          setHtml(result.value);
          void writeCachedJson(key, result.value);
        } else {
          const parsed = await parsePptx(buffer);
          if (cancelled || run !== token.current) return;
          setDeck(parsed);
          void writeCachedJson(key, parsed);
        }
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, format, key, rebuilding]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 pb-1">
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          aria-label="Zoom out document"
          onClick={() => applyZoom((v) => v - 0.15)}
        >
          <Minus className="size-3.5" />
        </Button>
        <button
          type="button"
          onClick={() => applyZoom(() => 1)}
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
          onClick={() => applyZoom((v) => v + 0.15)}
        >
          <Plus className="size-3.5" />
        </Button>
        {deck ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {deck.slides.length} slide{deck.slides.length === 1 ? "" : "s"}
          </span>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto size-7"
          aria-label="Rebuild document"
          title="Rebuild from the original file"
          onClick={async () => {
            await clearCachedDoc(key);
            setRebuilding((v) => !v);
          }}
        >
          <RefreshCw className="size-3.5" />
        </Button>
        {canDownload === false ? null : (
          <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
            <a href={url} download={title} target="_blank" rel="noreferrer">
              <Download className="size-3.5" />
              Download
            </a>
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-md bg-muted/30 p-2">
        {status === "loading" ? (
          <div className="space-y-2 p-2">
            <p className="text-sm text-muted-foreground">
              Preparing {format === "pptx" ? "slides" : "document"}… this happens once, then it
              opens instantly.
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
          deck ? (
            // Slides size themselves to their container, so zoom widens the stack
            // and the pane scrolls — the anchored scroll keeps the view steady.
            <div className="office-slides space-y-3" style={{ width: `${zoom * 100}%` }}>
              {deck.slides.map((_, index) => (
                <SlidePage key={index} deck={deck} index={index} />
              ))}
            </div>
          ) : (
            <div style={{ width: `${zoom * 100}%` }}>
              <div
                className="office-doc rounded-md border bg-white p-6 text-sm leading-relaxed text-black shadow-sm"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function SlidePage({ deck, index }: { deck: PptxDeck; index: number }) {
  const slide = deck.slides[index];
  if (!slide) return null;
  return (
    <div className="relative overflow-hidden rounded-md border shadow-sm">
      <div
        className="relative origin-top-left"
        style={{
          width: "100%",
          aspectRatio: `${deck.width} / ${deck.height}`,
          background: slide.background ?? "#ffffff",
        }}
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
          {slide.shapes.map((shape, i) => (
            <SlideShape key={i} shape={shape} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideShape({ shape }: { shape: PptxShape }) {
  const rotate = shape.rot ? `rotate(${shape.rot}deg)` : undefined;

  if (shape.type === "image") {
    return (
      <img
        src={shape.src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(event) => {
          // An image the browser can't decode should leave clean space,
          // not a broken-image icon on the slide.
          event.currentTarget.style.display = "none";
        }}
        style={{
          position: "absolute",
          left: shape.x,
          top: shape.y,
          width: shape.w || undefined,
          height: shape.h || undefined,
          objectFit: "contain",
          transform: rotate,
        }}
      />
    );
  }

  if (shape.type === "shape") {
    return (
      <div
        style={{
          position: "absolute",
          left: shape.x,
          top: shape.y,
          width: shape.w,
          height: shape.h,
          background: shape.fill ?? undefined,
          border: shape.line ? `${shape.line.width}px solid ${shape.line.color}` : undefined,
          borderRadius: shape.radius || undefined,
          transform: rotate,
        }}
      />
    );
  }

  const [lIns, tIns, rIns, bIns] = shape.insets;
  return (
    <div
      style={{
        position: "absolute",
        left: shape.x,
        top: shape.y,
        width: shape.w || undefined,
        height: shape.h || undefined,
        transform: rotate,
        display: "flex",
        flexDirection: "column",
        justifyContent:
          shape.anchor === "ctr" ? "center" : shape.anchor === "b" ? "flex-end" : "flex-start",
        padding: `${tIns}px ${rIns}px ${bIns}px ${lIns}px`,
        background: shape.fill ?? undefined,
        border: shape.line ? `${shape.line.width}px solid ${shape.line.color}` : undefined,
        borderRadius: shape.radius || undefined,
        boxSizing: "border-box",
        color: "#111",
        overflow: "visible",
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
                  : paragraph.align === "just"
                    ? "justify"
                    : "left",
            margin: `${paragraph.spaceBefore}px 0 ${paragraph.spaceAfter}px`,
            paddingLeft: paragraph.bullet ? 18 + paragraph.level * 18 : paragraph.level * 18,
            textIndent: paragraph.bullet ? -14 : 0,
            lineHeight: paragraph.lineHeight,
            whiteSpace: shape.wrap ? "pre-wrap" : "pre",
            minHeight: paragraph.runs.length === 0 ? "0.75em" : undefined,
            wordBreak: "break-word",
          }}
        >
          {paragraph.bullet ? `${paragraph.bullet} ` : ""}
          {paragraph.runs.map((run, ri) => (
            <span
              key={ri}
              style={{
                fontSize: run.size,
                fontFamily: run.font ? `"${run.font}", system-ui, sans-serif` : undefined,
                fontWeight: run.bold ? 700 : 400,
                fontStyle: run.italic ? "italic" : undefined,
                textDecoration: run.underline ? "underline" : undefined,
                color: run.color ?? undefined,
              }}
            >
              {run.text}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
