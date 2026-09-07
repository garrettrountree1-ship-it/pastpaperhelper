import { Eraser, Highlighter, MousePointer2, PenLine, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  emptyAnnotation,
  SlideAnnotations,
  type SlideAnnotation,
  type SlideTool,
} from "@/components/materials/SlideAnnotations";
import { Button } from "@/components/ui/button";
import { readCachedJson, writeCachedJson } from "@/lib/doc-cache";
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

/** Wraps any rendered page/document and overlays the markup layer on top. */
export function DocMarkupSurface({
  ratio,
  tool,
  penColor,
  highlightColor,
  value,
  onChange,
  children,
}: {
  /** height / width of the wrapped content. */
  ratio: number;
  tool: SlideTool;
  penColor: string;
  highlightColor?: string | undefined;
  value: SlideAnnotation;
  onChange: (next: SlideAnnotation) => void;
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

  const scale = width > 0 ? width / MARKUP_WIDTH : 1;

  return (
    <div ref={hostRef} className="relative">
      {children}
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: tool === "none" ? "none" : "auto",
        }}
      >
        <SlideAnnotations
          width={MARKUP_WIDTH}
          height={Math.max(1, Math.round(MARKUP_WIDTH * ratio))}
          tool={tool}
          color={penColor}
          highlightColor={highlightColor}
          value={value}
          onChange={onChange}
        />
      </div>
    </div>
  );
}
