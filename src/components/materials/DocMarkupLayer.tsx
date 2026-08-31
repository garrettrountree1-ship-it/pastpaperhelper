import { Eraser, MousePointer2, PenLine, Type } from "lucide-react";
import { useEffect, useState } from "react";

import {
  emptyAnnotation,
  SlideAnnotations,
  type SlideAnnotation,
  type SlideTool,
} from "@/components/materials/SlideAnnotations";
import { Button } from "@/components/ui/button";
import { readCachedJson, writeCachedJson } from "@/lib/doc-cache";

const SWATCHES = ["#dc2626", "#2563eb", "#16a34a", "#111827"];

/** Virtual document width used for annotation coordinates (zoom-independent). */
export const MARKUP_WIDTH = 1000;

/**
 * Drawing / text-box markup shared by the PDF and Word viewers, so a teacher can
 * annotate any uploaded resource — not just slides. Marks are stored per page
 * (or per document, for a flowing Word file) and kept locally so they are still
 * there next lesson.
 */
export function useDocMarkup(storageKey: string) {
  const [tool, setTool] = useState<SlideTool>("none");
  const [penColor, setPenColor] = useState(SWATCHES[0]!);
  const [notes, setNotes] = useState<Record<number, SlideAnnotation>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await readCachedJson<Record<number, SlideAnnotation>>(storageKey);
      if (!cancelled) setNotes(saved ?? {});
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

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

  return { tool, setTool, penColor, setPenColor, annotationOf, update };
}

export function DocMarkupToolbar({
  tool,
  setTool,
  penColor,
  setPenColor,
}: {
  tool: SlideTool;
  setTool: (next: SlideTool) => void;
  penColor: string;
  setPenColor: (next: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {(
        [
          ["none", "Select", MousePointer2],
          ["draw", "Draw on the document", PenLine],
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
      {SWATCHES.map((swatch) => (
        <button
          key={swatch}
          type="button"
          aria-label={`Pen colour ${swatch}`}
          onClick={() => setPenColor(swatch)}
          className={`size-5 rounded-full border-2 ${
            penColor === swatch ? "scale-110 border-foreground" : "border-border"
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
  value,
  onChange,
  children,
}: {
  /** height / width of the wrapped content. */
  ratio: number;
  tool: SlideTool;
  penColor: string;
  value: SlideAnnotation;
  onChange: (next: SlideAnnotation) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      <div className={`absolute inset-0 ${tool === "none" ? "pointer-events-none" : ""}`}>
        <SlideAnnotations
          width={MARKUP_WIDTH}
          height={Math.max(1, Math.round(MARKUP_WIDTH * ratio))}
          tool={tool}
          color={penColor}
          value={value}
          onChange={onChange}
        />
      </div>
    </div>
  );
}
