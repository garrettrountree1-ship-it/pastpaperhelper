import { Move, X } from "lucide-react";
import { useRef, useState } from "react";
import { useUndoHistory } from "@/hooks/use-undo-history";
import { escapeHtml, formatSelection } from "@/lib/rich-text";
import { RichTextEditable } from "@/components/materials/RichTextEditable";


export type SlideStroke = {
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  /** Highlighter marks are wide, translucent and sit under the text. */
  highlight?: boolean;
};
export type SlideTextBox = {
  x: number;
  y: number;
  text: string;
  /** Inline formatting for the words the user highlighted. */
  html?: string;
  color: string;
  size: number;
  /** Box width in document coordinates; teachers can drag the corner to change it. */
  w?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};
export type SlideAnnotation = { strokes: SlideStroke[]; texts: SlideTextBox[] };

export const emptyAnnotation: SlideAnnotation = { strokes: [], texts: [] };

export type SlideTool = "none" | "edit" | "draw" | "highlight" | "erase" | "text";

/** Highlighter stroke thickness in document coordinates. */
export const HIGHLIGHT_WIDTH = 22;

const strokePath = (stroke: SlideStroke) =>
  stroke.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

/**
 * Highlighter marks, painted so they behave like a real highlighter: the colour
 * multiplies with whatever is underneath, so the words stay readable and the
 * colour stays strong. This layer must sit in the same stacking context as the
 * page/slide it marks (a sibling of the picture), otherwise the blend has
 * nothing to mix with and the colour comes out almost invisible.
 */
export function HighlightLayer({
  width,
  height,
  strokes,
}: {
  width: number;
  height: number;
  strokes: SlideStroke[];
}) {
  const marks = strokes.filter((stroke) => stroke.highlight);
  if (marks.length === 0) return null;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute left-0 top-0 h-full w-full"
      style={{ mixBlendMode: "multiply" }}
    >
      {marks.map((stroke, i) => (
        <path
          key={i}
          d={strokePath(stroke)}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

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
  highlightColor,
  value,
  onChange,
  hideHighlights = false,
}: {
  width: number;
  height: number;
  tool: SlideTool;
  color: string;
  highlightColor?: string | undefined;
  value: SlideAnnotation;
  onChange: (next: SlideAnnotation) => void;
  /** Set when the caller paints highlighter marks with its own blended layer. */
  hideHighlights?: boolean;
}) {

  const hostRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const [live, setLive] = useState<SlideStroke | null>(null);
  const [activeText, setActiveText] = useState<number | null>(null);
  // Text boxes only accept clicks when the pointer isn't being used to mark up.
  const textActive = tool === "none" || tool === "edit" || tool === "text";
  const { undo, redo } = useUndoHistory(value, onChange);
  // Latest marks, so a drag started earlier still writes onto current state.
  const valueRef = useRef(value);
  valueRef.current = value;
  const drag = useRef<{ index: number; startX: number; startY: number; x: number; y: number } | null>(
    null,
  );

  /** Pick up a text box by its move grip and slide it around the page. */
  function beginDrag(event: React.PointerEvent, index: number) {
    const box = value.texts[index];
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = hostRef.current?.getBoundingClientRect();
    const scale = rect && rect.width > 0 ? rect.width / width : 1;
    drag.current = { index, startX: event.clientX, startY: event.clientY, x: box.x, y: box.y };

    const onMove = (moveEvent: PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      const nextX = state.x + (moveEvent.clientX - state.startX) / scale;
      const nextY = state.y + (moveEvent.clientY - state.startY) / scale;
      const current = valueRef.current;
      onChange({
        ...current,
        texts: current.texts.map((t, i) =>
          i === state.index ? { ...t, x: Math.round(nextX), y: Math.round(nextY) } : t,
        ),
      });
    };
    const onUp = () => {
      drag.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  /** Drag the corner: sideways changes the width, up/down changes the text size. */
  function beginResize(event: React.PointerEvent, index: number) {
    const box = value.texts[index];
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = hostRef.current?.getBoundingClientRect();
    const scale = rect && rect.width > 0 ? rect.width / width : 1;
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = box.w ?? 420;
    const startSize = box.size;

    const onMove = (moveEvent: PointerEvent) => {
      const nextW = Math.max(120, startW + (moveEvent.clientX - startX) / scale);
      const nextSize = Math.max(
        10,
        Math.min(120, startSize + (moveEvent.clientY - startY) / scale / 4),
      );
      const current = valueRef.current;
      onChange({
        ...current,
        texts: current.texts.map((t, i) =>
          i === index ? { ...t, w: Math.round(nextW), size: Math.round(nextSize) } : t,
        ),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }



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
    setLive(
      tool === "highlight"
        ? {
            points: [point],
            color: highlightColor ?? "#fde047",
            width: HIGHLIGHT_WIDTH,
            highlight: true,
          }
        : { points: [point], color, width: 4 },
    );
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

  const path = strokePath;
  // Saved highlighter marks are painted by the caller's blended layer when it
  // has one; the mark being drawn right now is always shown here so the teacher
  // sees the stroke follow the pointer.
  const highlightStrokes = [...(hideHighlights ? [] : value.strokes), ...(live ? [live] : [])].filter(
    (stroke) => stroke.highlight,
  );

  return (
    <div
      ref={hostRef}
      className="absolute left-0 top-0"
      style={{
        width,
        height,
        pointerEvents: tool === "none" || tool === "edit" ? "none" : "auto",
        cursor:
          tool === "draw" || tool === "highlight"
            ? "crosshair"
            : tool === "text"
              ? "text"
              : "default",
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
        {/* Highlighter first, blended so the text underneath stays readable. */}
        <g style={{ mixBlendMode: "multiply" }}>
          {highlightStrokes.map((stroke, i) => (
            <path
              key={`h${i}`}
              d={path(stroke)}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeOpacity={0.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>

        {[...value.strokes, ...(live ? [live] : [])]
          .filter((stroke) => !stroke.highlight)
          .map((stroke, i) => (
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
          style={{
            left: box.x,
            top: box.y,
            // While drawing, highlighting or erasing, the text boxes stay out of
            // the way: no caret, no accidental text selection.
            pointerEvents: textActive ? "auto" : "none",
            userSelect: textActive ? undefined : "none",
          }}
        >

          <div className="relative">
            {activeText === index ? (
            <div
              className="absolute -top-8 left-0 flex items-center gap-1 rounded border bg-white/95 px-1 py-0.5 shadow"
              onPointerDown={(event) => event.stopPropagation()}
            >
              {(
                [
                  ["bold", "B", "font-bold"],
                  ["italic", "I", "italic"],
                  ["underline", "U", "underline"],
                ] as const
              ).map(([key, label, cls]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={`Toggle ${key}`}
                  title={`${label} — highlighted text, or the text you type next`}
                  // Keep the highlighted words selected while clicking.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => formatSelection(key)}
                  className={`size-6 rounded text-xs text-neutral-800 hover:bg-neutral-200 ${cls}`}
                >
                  {label}
                </button>
              ))}
            </div>
            ) : null}
            <RichTextEditable
              autoFocus={box.text === ""}
              html={box.html ?? escapeHtml(box.text)}
              placeholder="Type here…"
              onUndo={undo}
              onRedo={redo}
              onFocus={() => setActiveText(index)}
              onBlur={() => setActiveText((current) => (current === index ? null : current))}
              onChange={({ html, text }) => {
                const texts = value.texts.map((t, i) =>
                  i === index ? { ...t, html, text } : t,
                );
                onChange({ ...value, texts });
              }}
              className="min-h-[1.6em] w-[420px] overflow-auto rounded border border-dashed border-neutral-400 bg-white/85 p-1"
              style={{
                color: box.color,
                fontSize: box.size,
                lineHeight: 1.25,
              }}
            />


            {textActive ? (
              <button
                type="button"
                aria-label="Move text box"
                title="Drag to move this text box"
                onPointerDown={(event) => beginDrag(event, index)}
                className="absolute -left-3 -top-3 cursor-grab touch-none rounded-full border bg-white p-1 shadow active:cursor-grabbing"
              >
                <Move className="size-4 text-neutral-700" />
              </button>
            ) : null}

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
