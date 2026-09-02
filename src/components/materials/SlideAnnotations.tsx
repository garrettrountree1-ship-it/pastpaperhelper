import { X } from "lucide-react";
import { useRef, useState } from "react";

export type SlideStroke = { points: Array<{ x: number; y: number }>; color: string; width: number };
export type SlideTextBox = {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};
export type SlideAnnotation = { strokes: SlideStroke[]; texts: SlideTextBox[] };

export const emptyAnnotation: SlideAnnotation = { strokes: [], texts: [] };

export type SlideTool = "none" | "edit" | "draw" | "erase" | "text";

/**
 * Transparent drawing / text-box layer that sits on top of a rendered slide.
 * Coordinates are stored in slide space (the deck's own pixel size), so the
 * marks stay locked to the slide at any zoom level.
 */
export function SlideAnnotations({
  width,
  height,
  tool,
  color,
  value,
  onChange,
}: {
  width: number;
  height: number;
  tool: SlideTool;
  color: string;
  value: SlideAnnotation;
  onChange: (next: SlideAnnotation) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const [live, setLive] = useState<SlideStroke | null>(null);

  function pointOf(event: React.PointerEvent) {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    const scale = rect.width / width;
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  }

  function down(event: React.PointerEvent) {
    if (tool === "none") return;
    const point = pointOf(event);

    if (tool === "text") {
      onChange({
        ...value,
        texts: [...value.texts, { ...point, text: "", color, size: 28 }],
      });
      return;
    }

    if (tool === "erase") {
      // Remove any stroke passing near the tap.
      const kept = value.strokes.filter(
        (stroke) => !stroke.points.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < 24),
      );
      if (kept.length !== value.strokes.length) onChange({ ...value, strokes: kept });
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    setLive({ points: [point], color, width: 4 });
  }

  function move(event: React.PointerEvent) {
    if (!drawing.current) return;
    event.preventDefault();
    const point = pointOf(event);
    setLive((current) => (current ? { ...current, points: [...current.points, point] } : current));
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    if (live && live.points.length > 1) onChange({ ...value, strokes: [...value.strokes, live] });
    setLive(null);
  }

  const path = (stroke: SlideStroke) =>
    stroke.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <div
      ref={hostRef}
      className="absolute left-0 top-0"
      style={{
        width,
        height,
        pointerEvents: tool === "none" || tool === "edit" ? "none" : "auto",
        cursor: tool === "draw" ? "crosshair" : tool === "text" ? "text" : "default",
        touchAction: tool === "none" || tool === "edit" ? undefined : "none",
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <svg
        width={width}
        height={height}
        className="absolute left-0 top-0"
        style={{ pointerEvents: "none" }}
      >
        {[...value.strokes, ...(live ? [live] : [])].map((stroke, i) => (
          <path
            key={i}
            d={path(stroke)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {value.texts.map((box, index) => (
        <div
          key={index}
          className="absolute"
          style={{ left: box.x, top: box.y, pointerEvents: "auto" }}
        >
          <div className="relative">
            <textarea
              autoFocus={box.text === ""}
              value={box.text}
              placeholder="Type here…"
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => {
                const texts = value.texts.map((t, i) =>
                  i === index ? { ...t, text: event.target.value } : t,
                );
                onChange({ ...value, texts });
              }}
              className="min-h-[1.6em] w-[420px] resize rounded border border-dashed border-neutral-400 bg-white/85 p-1 outline-none"
              style={{ color: box.color, fontSize: box.size, lineHeight: 1.25 }}
            />
            <button
              type="button"
              aria-label="Delete text box"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() =>
                onChange({ ...value, texts: value.texts.filter((_, i) => i !== index) })
              }
              className="absolute -right-3 -top-3 rounded-full border bg-white p-1 shadow"
            >
              <X className="size-4 text-neutral-700" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
