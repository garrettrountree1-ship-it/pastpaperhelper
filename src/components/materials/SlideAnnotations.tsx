import { Move, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
/** A picture pasted onto the page or into the blank space beside it. */
export type SlideImage = {
  x: number;
  y: number;
  /** Width in document coordinates; the height follows the picture's shape. */
  w: number;
  src: string;
};
export type SlideAnnotation = {
  strokes: SlideStroke[];
  texts: SlideTextBox[];
  images?: SlideImage[];
};

export const emptyAnnotation: SlideAnnotation = { strokes: [], texts: [], images: [] };

/**
 * The surface the pointer was last used on, so a pasted picture lands on the
 * page (or margin) the user is actually working on rather than every page.
 */
let activeSurface: symbol | null = null;

/** Shrinks a pasted picture so saved marks stay small. */
async function shrinkPastedImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that picture."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't open that picture."));
    el.src = dataUrl;
  });
  const maxWidth = 900;
  if (image.naturalWidth <= maxWidth) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = maxWidth;
  canvas.height = Math.round((image.naturalHeight / image.naturalWidth) * maxWidth);
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export type SlideTool = "none" | "edit" | "draw" | "highlight" | "erase" | "text";

/** Highlighter stroke thickness in document coordinates. */
export const HIGHLIGHT_WIDTH = 22;

const strokePath = (stroke: SlideStroke) =>
  stroke.points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

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
  const erasing = useRef(false);
  const touchPointers = useRef(new Set<number>());
  const multiTouch = useRef(false);
  const [live, setLive] = useState<SlideStroke | null>(null);
  const [activeText, setActiveText] = useState<number | null>(null);
  // Text boxes only accept clicks when the pointer isn't being used to mark up.
  const textActive = tool === "none" || tool === "edit" || tool === "text";
  const { undo, redo } = useUndoHistory(value, onChange);
  // Latest marks, so a drag started earlier still writes onto current state.
  const valueRef = useRef(value);
  valueRef.current = value;
  const drag = useRef<{
    index: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const images = value.images ?? [];
  const surfaceId = useRef<symbol>(Symbol("markup-surface"));
  const lastPoint = useRef({ x: Math.round(width * 0.1), y: Math.round(height * 0.1) });

  // Remember where the pointer was last put down on this surface, so a pasted
  // picture appears there — including in the blank space beside the page.
  useEffect(() => {
    const id = surfaceId.current;
    const onDown = (event: PointerEvent) => {
      const rect = hostRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        return;
      const scale = rect.width / width;
      activeSurface = id;
      lastPoint.current = {
        x: (event.clientX - rect.left) / scale,
        y: (event.clientY - rect.top) / scale,
      };
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      if (activeSurface === id) activeSurface = null;
    };
  }, [width]);

  // Paste a picture straight onto the page or the blank space beside it.
  useEffect(() => {
    const id = surfaceId.current;
    const onPaste = (event: ClipboardEvent) => {
      if (activeSurface !== id) return;
      const target = event.target as HTMLElement | null;
      // Never steal a paste meant for a text box or an ordinary input.
      if (target?.closest?.('[contenteditable="true"], input, textarea')) return;
      const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (!file) return;
      event.preventDefault();
      void (async () => {
        try {
          const src = await shrinkPastedImage(file);
          const point = lastPoint.current;
          const current = valueRef.current;
          onChange({
            ...current,
            images: [
              ...(current.images ?? []),
              {
                x: Math.round(point.x),
                y: Math.round(point.y),
                w: Math.round(width * 0.35),
                src,
              },
            ],
          });
        } catch {
          /* an unreadable picture is simply ignored */
        }
      })();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [width, onChange]);

  /** Drag a pasted picture around, or drag its corner to resize it. */
  function beginImageDrag(event: React.PointerEvent, index: number, mode: "move" | "resize") {
    const picture = images[index];
    if (!picture) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = hostRef.current?.getBoundingClientRect();
    const scale = rect && rect.width > 0 ? rect.width / width : 1;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { x: picture.x, y: picture.y, w: picture.w };

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / scale;
      const dy = (moveEvent.clientY - startY) / scale;
      const current = valueRef.current;
      const list = current.images ?? [];
      onChange({
        ...current,
        images: list.map((item, i) =>
          i !== index
            ? item
            : mode === "move"
              ? { ...item, x: Math.round(start.x + dx), y: Math.round(start.y + dy) }
              : { ...item, w: Math.max(40, Math.round(start.w + dx)) },
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

  function eraseAt(point: { x: number; y: number }) {
    const radius = 20;
    const strokes = valueRef.current.strokes.flatMap((stroke) => {
      const pieces: SlideStroke[] = [];
      let points: SlideStroke["points"] = [];
      for (const current of stroke.points) {
        if (Math.hypot(current.x - point.x, current.y - point.y) < radius) {
          if (points.length > 1) pieces.push({ ...stroke, points });
          points = [];
        } else {
          points.push(current);
        }
      }
      if (points.length > 1) pieces.push({ ...stroke, points });
      return pieces;
    });
    const current = valueRef.current;
    const beforePoints = current.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
    const afterPoints = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
    if (afterPoints !== beforePoints) onChange({ ...current, strokes });
  }

  function down(event: React.PointerEvent) {
    if (tool === "none") return;
    if (event.pointerType === "touch") {
      touchPointers.current.add(event.pointerId);
      if (touchPointers.current.size > 1) {
        multiTouch.current = true;
        drawing.current = false;
        erasing.current = false;
        setLive(null);
        return;
      }
      if (multiTouch.current) return;
    }
    const point = pointOf(event);

    if (tool === "text") {
      onChange({
        ...value,
        texts: [...value.texts, { ...point, text: "", color, size: 28 }],
      });
      return;
    }

    if (tool === "erase") {
      event.currentTarget.setPointerCapture(event.pointerId);
      erasing.current = true;
      eraseAt(point);
      // A tap on a picture still removes that picture.
      const keptImages = images.filter(
        (picture) =>
          !(
            point.x >= picture.x &&
            point.x <= picture.x + picture.w &&
            point.y >= picture.y &&
            point.y <= picture.y + picture.w * 1.6
          ),
      );
      if (keptImages.length !== images.length) onChange({ ...value, images: keptImages });
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
    if (multiTouch.current) return;
    if (erasing.current) {
      eraseAt(pointOf(event));
      return;
    }
    if (!drawing.current) return;
    event.preventDefault();
    const point = pointOf(event);
    setLive((current) => (current ? { ...current, points: [...current.points, point] } : current));
  }

  function up(event: React.PointerEvent) {
    if (event.pointerType === "touch") {
      touchPointers.current.delete(event.pointerId);
      if (touchPointers.current.size === 0) multiTouch.current = false;
    }
    if (erasing.current) {
      erasing.current = false;
      return;
    }
    if (!drawing.current) return;
    drawing.current = false;
    if (live && live.points.length > 1) onChange({ ...value, strokes: [...value.strokes, live] });
    setLive(null);
  }

  const path = strokePath;
  // Saved highlighter marks are painted by the caller's blended layer when it
  // has one; the mark being drawn right now is always shown here so the teacher
  // sees the stroke follow the pointer.
  const highlightStrokes = [
    ...(hideHighlights ? [] : value.strokes),
    ...(live ? [live] : []),
  ].filter((stroke) => stroke.highlight);

  return (
    <div
      ref={hostRef}
      data-touch-draw={tool === "none" || tool === "edit" ? undefined : "true"}
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
        touchAction: tool === "none" || tool === "edit" ? undefined : "pinch-zoom",
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onTouchStart={(event) => {
        if (event.touches.length < 2) return;
        multiTouch.current = true;
        drawing.current = false;
        erasing.current = false;
        setLive(null);
      }}
    >
      {/* Pasted pictures sit under the ink, so they can be drawn on. */}
      {images.map((picture, index) => (
        <div
          key={`img-${index}`}
          className="absolute"
          style={{
            left: picture.x,
            top: picture.y,
            width: picture.w,
            pointerEvents: textActive ? "auto" : "none",
          }}
        >
          <div className="relative">
            <img
              src={picture.src}
              alt="Pasted picture"
              draggable={false}
              className="block w-full select-none rounded shadow-sm"
            />
            {textActive ? (
              <>
                <button
                  type="button"
                  aria-label="Move picture"
                  title="Drag to move this picture"
                  onPointerDown={(event) => beginImageDrag(event, index, "move")}
                  className="absolute -left-3 -top-3 cursor-grab touch-none rounded-full border bg-white p-1 shadow active:cursor-grabbing"
                >
                  <Move className="size-4 text-neutral-700" />
                </button>
                <span
                  aria-label="Resize picture"
                  title="Drag to make this picture bigger or smaller"
                  onPointerDown={(event) => beginImageDrag(event, index, "resize")}
                  className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize touch-none rounded-sm border border-neutral-500 bg-white shadow"
                />
                <button
                  type="button"
                  aria-label="Delete picture"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() =>
                    onChange({ ...value, images: images.filter((_, i) => i !== index) })
                  }
                  className="absolute -right-3 -top-3 rounded-full border bg-white p-1 shadow"
                >
                  <X className="size-4 text-neutral-700" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ))}

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
                const texts = value.texts.map((t, i) => (i === index ? { ...t, html, text } : t));
                onChange({ ...value, texts });
              }}
              className="min-h-[1.6em] overflow-auto rounded border border-dashed border-neutral-400 bg-white/85 p-1"
              style={{
                color: box.color,
                fontSize: box.size,
                lineHeight: 1.25,
                width: box.w ?? 420,
              }}
            />

            {textActive ? (
              <>
                <button
                  type="button"
                  aria-label="Move text box"
                  title="Drag to move this text box"
                  onPointerDown={(event) => beginDrag(event, index)}
                  className="absolute -left-3 -top-3 cursor-grab touch-none rounded-full border bg-white p-1 shadow active:cursor-grabbing"
                >
                  <Move className="size-4 text-neutral-700" />
                </button>
                <span
                  aria-label="Resize text box"
                  title="Drag to make this box wider or the text bigger"
                  onPointerDown={(event) => beginResize(event, index)}
                  className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize touch-none rounded-sm border border-neutral-500 bg-white shadow"
                />
              </>
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
