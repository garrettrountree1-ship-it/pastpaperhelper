import { Eraser, Highlighter, MousePointer2, PenLine, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  emptyAnnotation,
  HighlightLayer,
  SlideAnnotations,
  type SlideAnnotation,
  type SlideTool,
} from "@/components/materials/SlideAnnotations";

import { Button } from "@/components/ui/button";
import { readCachedJson, writeCachedJson } from "@/lib/doc-cache";
import { useMirrorField } from "@/lib/lesson-mirror";
import { scopedKey, useMarkupScope } from "@/lib/markup-scope";

const SWATCHES = ["#dc2626", "#2563eb", "#16a34a", "#111827"];

/** Highlighter colours (translucent when drawn over text). */
export const HIGHLIGHT_SWATCHES = ["#fde047", "#86efac", "#93c5fd", "#f9a8d4", "#fdba74"];

/** Virtual document width used for annotation coordinates (zoom-independent). */
export const MARKUP_WIDTH = 1000;

/**
 * Drawing / text-box markup shared by the PDF and Word viewers, so a teacher can
 * annotate any uploaded resource — not just slides. Marks are stored per page
 * (or per document, for a flowing Word file) and kept locally so they are still
 * there next lesson.
 */
export function useDocMarkup(baseKey: string) {
  const [tool, setTool] = useState<SlideTool>("none");
  const [penColor, setPenColor] = useState(SWATCHES[0]!);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_SWATCHES[0]!);
  const [notes, setNotes] = useState<Record<number, SlideAnnotation>>({});
  // Markup is personal: each account (and each demo view) keeps its own marks.
  const { ready, scope } = useMarkupScope();
  const storageKey = scopedKey(baseKey, scope);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      const saved = await readCachedJson<Record<number, SlideAnnotation>>(storageKey);
      if (!cancelled) setNotes(saved ?? {});
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, ready]);

  // Marks the teacher makes on the document appear live on student screens,
  // whether or not the teacher is mirroring their whole view.
  useMirrorField(`markup:${baseKey}`, notes, setNotes, "content");

  function annotationOf(index: number) {
    return notes[index] ?? emptyAnnotation;
  }

  function update(index: number, next: SlideAnnotation) {
    setNotes((current) => {
      const merged = { ...current, [index]: next };
      void writeCachedJson(storageKey, merged);
      return merged;
    });
  }

  return {
    tool,
    setTool,
    penColor,
    setPenColor,
    highlightColor,
    setHighlightColor,
    annotationOf,
    update,
  };
}

export function DocMarkupToolbar({
  tool,
  setTool,
  penColor,
  setPenColor,
  highlightColor,
  setHighlightColor,
}: {
  tool: SlideTool;
  setTool: (next: SlideTool) => void;
  penColor: string;
  setPenColor: (next: string) => void;
  highlightColor?: string | undefined;
  setHighlightColor?: ((next: string) => void) | undefined;
}) {
  const highlighting = tool === "highlight";
  return (
    <div className="flex items-center gap-1">
      {(
        [
          ["none", "Select", MousePointer2],
          ["draw", "Draw on the document", PenLine],
          ["highlight", "Highlight text", Highlighter],
          ["text", "Add a text box", Type],
          ["erase", "Erase marks", Eraser],
        ] as const
      ).map(([value, label, Icon]) => (
        <Button
          key={value}
          size="icon"
          variant={tool === value ? "default" : "outline"}
          className="size-7"
          aria-label={label}
          title={label}
          aria-pressed={tool === value}
          onClick={() => setTool(value)}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
      {(highlighting ? HIGHLIGHT_SWATCHES : SWATCHES).map((swatch) => (
        <button
          key={swatch}
          type="button"
          aria-label={`${highlighting ? "Highlighter" : "Pen"} colour ${swatch}`}
          aria-pressed={(highlighting ? highlightColor : penColor) === swatch}
          onClick={() => (highlighting ? setHighlightColor?.(swatch) : setPenColor(swatch))}
          className={`size-5 rounded-full border-2 ${
            (highlighting ? highlightColor : penColor) === swatch
              ? "scale-110 border-foreground"
              : "border-border"
          }`}
          style={{ backgroundColor: swatch }}
        />
      ))}
    </div>
  );
}

/**
 * Wraps any rendered page/document and overlays the markup layer on top.
 *
 * When the page is zoomed out it only fills part of the pane, so the leftover
 * room to its right becomes plain white writing space covered by the very same
 * markup layer — a line can run straight off the page and carry on beside it,
 * and pictures can be pasted there too.
 */
export function DocMarkupSurface({
  ratio,
  tool,
  penColor,
  highlightColor,
  value,
  onChange,
  pageFraction = 1,
  children,
}: {
  /** height / width of the wrapped content. */
  ratio: number;
  tool: SlideTool;
  penColor: string;
  highlightColor?: string | undefined;
  value: SlideAnnotation;
  onChange: (next: SlideAnnotation) => void;
  /** How much of the available width the page itself takes (1 = all of it). */
  pageFraction?: number;
  children: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  // The markup lives in a fixed 1000px-wide coordinate space and is scaled to the
  // rendered size, so marks stay locked to the page at any zoom level.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fraction = Math.min(1, Math.max(0.05, pageFraction));
  // Markup width covers the page plus the blank space beside it.
  const surfaceWidth = Math.round(MARKUP_WIDTH / fraction);
  const scale = width > 0 ? width / surfaceWidth : 1;
  const markupHeight = Math.max(1, Math.round(MARKUP_WIDTH * ratio));

  return (
    <div ref={hostRef} className="relative flex items-stretch">
      <div className="relative shrink-0" style={{ width: `${fraction * 100}%` }}>
        {children}
      </div>
      {fraction < 1 ? (
        <div
          aria-label="Extra writing space"
          className="min-w-0 flex-1 rounded-md border border-dashed bg-white"
        />
      ) : null}
      {/* Highlighter marks sit here, beside the page, so the colour blends with
          the words underneath instead of coming out almost invisible. */}
      <HighlightLayer width={surfaceWidth} height={markupHeight} strokes={value.strokes} />
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: tool === "none" ? "none" : "auto",
        }}
      >
        <SlideAnnotations
          width={surfaceWidth}
          height={markupHeight}
          tool={tool}
          color={penColor}
          highlightColor={highlightColor}
          value={value}
          onChange={onChange}
          hideHighlights
        />
      </div>
    </div>
  );
}
