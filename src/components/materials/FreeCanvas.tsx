import { GripVertical, Pause, RotateCw, Trash2, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useUndoHistory } from "@/hooks/use-undo-history";
import { useMirrorField } from "@/lib/lesson-mirror";
import { escapeHtml, formatSelection } from "@/lib/rich-text";
import { textShortcutOf } from "@/lib/text-shortcuts";
import { RichTextEditable } from "@/components/materials/RichTextEditable";
import type { NoteBlock } from "@/lib/notes.functions";


/**
 * "select" is the arrow: click things to pick them up, move them, resize them or
 * delete them, without ever starting a new text box by accident.
 */
export type CanvasMode = "select" | "type" | "draw" | "highlight" | "erase";

/** A pen line still being drawn, shared live with mirrored screens. */
type LiveStroke = {
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  highlight: boolean;
} | null;

/** Highlighter stroke thickness on the canvas. */
export const CANVAS_HIGHLIGHT_WIDTH = 20;

export const TEXT_COLORS: string[] = [
  "#111827",
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#7c3aed",
];


/** Distance from a point to a segment, for eraser hit-testing. */
function distToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

function pointsOf(d: string): Array<{ x: number; y: number }> {
  return d
    .split(/(?=[ML])/)
    .map((chunk) => {
      const match = chunk.match(/[ML](-?\d+)\s+(-?\d+)/);
      return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
    })
    .filter((p): p is { x: number; y: number } => p !== null);
}

function strokeHit(ink: Extract<NoteBlock, { type: "ink" }>, at: { x: number; y: number }) {
  const pts = pointsOf(ink.d);
  const radius = Math.max(10, ink.width + 8);
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(at, pts[i]!, pts[i + 1]!) <= radius) return true;
  }
  return pts.length === 1 && distToSegment(at, pts[0]!, pts[0]!) <= radius;
}

/** Words in read-only notes are clickable so the tutor can explain a concept. */
function ClickableText({ text, onConcept }: { text: string; onConcept: (value: string) => void }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {text.split(/(\s+)/).map((chunk, index) =>
        chunk.trim() ? (
          <button
            key={index}
            type="button"
            onClick={() => onConcept(chunk.replace(/[^\p{L}\p{N}+\-()/.]/gu, ""))}
            className="rounded px-0.5 text-left transition-colors hover:bg-accent/15 hover:text-primary"
          >
            {chunk}
          </button>
        ) : (
          <span key={index}>{chunk}</span>
        ),
      )}
    </p>
  );
}

function pathFrom(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${Math.round(point.x)} ${Math.round(point.y)}`)
    .join(" ");
}

/**
 * One continuous blank sheet: type anywhere, draw anywhere, paste images and
 * resize them. No pages, no separate drawing box — the whole surface is live.
 */
export function FreeCanvas({
  blocks,
  canEdit,
  mode,
  penColor,
  highlightColor = "#fde047",
  penWidth,
  imageUrls,
  zoom = 1,
  onChange,
  onPointerAt,

  onConcept,
}: {
  blocks: NoteBlock[];
  canEdit: boolean;
  mode: CanvasMode;
  penColor: string;
  highlightColor?: string;
  penWidth: number;
  imageUrls: Record<string, string> | undefined;
  zoom?: number;
  onChange: (next: NoteBlock[]) => void;
  /** Reports the pointer's place on the sheet, so pasted pictures land there. */
  onPointerAt?: (at: { x: number; y: number }) => void;
  onConcept: (value: string) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState<Array<{ x: number; y: number }> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const drawing = useRef(false);
  const { undo, redo } = useUndoHistory(blocks, onChange);




  const contentBottom = blocks.reduce((max, block) => {
    if (block.type === "ink") return Math.max(max, block.bottom ?? 0);
    const height = block.type === "image" ? (block.h ?? 300) : 200;
    return Math.max(max, (block.y ?? 0) + height);
  }, 0);

  // A monotonic document extent behaves like a word processor: reaching the
  // bottom appends one more viewport, while scrolling upward never changes the
  // document or scrollbar size.
  const [documentHeight, setDocumentHeight] = useState(() =>
    Math.max(1800, contentBottom + 700),
  );

  useEffect(() => {
    setDocumentHeight((current) => Math.max(current, contentBottom + 700, 1800));
  }, [contentBottom]);

  // The sheet must be exactly as long on the student screen as on the teacher's,
  // otherwise the same scroll position lands somewhere else.
  useMirrorField("canvas.height", documentHeight, setDocumentHeight);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    // Find the pane that actually scrolls (its own CSS overflow, not just its
    // current content height — an empty sheet would otherwise be skipped).
    let el: HTMLElement | null = surface.parentElement;
    let scroller: HTMLElement | null = null;
    while (el) {
      const overflow = window.getComputedStyle(el).overflowY;
      if (overflow === "auto" || overflow === "scroll") {
        scroller = el;
        break;
      }
      el = el.parentElement;
    }
    if (!scroller) return;

    const pane = scroller;
    let previousTop = pane.scrollTop;
    let queued = false;
    const grow = () => {
      const currentTop = pane.scrollTop;
      const movingDown = currentTop > previousTop;
      previousTop = currentTop;
      if (!movingDown || queued) return;

      const remaining = pane.scrollHeight - currentTop - pane.clientHeight;
      if (remaining > Math.min(400, pane.clientHeight * 0.5)) return;

      queued = true;
      setDocumentHeight((current) =>
        current + Math.max(900, Math.ceil(pane.clientHeight / zoom)),
      );
      requestAnimationFrame(() => {
        queued = false;
        previousTop = pane.scrollTop;
      });
    };
    pane.addEventListener("scroll", grow, { passive: true });
    return () => {
      pane.removeEventListener("scroll", grow);
    };
  }, [zoom]);

  const height = Math.max(documentHeight, contentBottom + 700);




  // Pointer positions arrive in screen pixels; the sheet may be zoomed, so
  // convert back into unscaled canvas coordinates.
  function point(event: { clientX: number; clientY: number }) {
    const surface = surfaceRef.current;
    if (!surface) return { x: 0, y: 0 };
    const rect = surface.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
  }


  function patch(id: string, changes: Record<string, unknown>) {
    onChange(
      blocks.map((block) => (block.id === id ? ({ ...block, ...changes } as NoteBlock) : block)),
    );
  }


  function remove(id: string) {
    onChange(blocks.filter((block) => block.id !== id));
  }

  function startMove(id: string, event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const block = blocks.find((b) => b.id === id);
    if (!block || block.type === "ink") return;
    const origin = point(event);
    const baseX = block.x ?? 0;
    const baseY = block.y ?? 0;
    const onMove = (move: PointerEvent) => {
      const next = point(move);
      patch(id, {
        x: Math.max(0, baseX + (next.x - origin.x)),
        y: Math.max(0, baseY + (next.y - origin.y)),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Drag from anywhere on a text box: a small movement starts the move, a
  // plain click still puts the caret in the words.
  function startMoveAnywhere(id: string, event: React.PointerEvent) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, select, input, textarea, a")) return;
    const editor = target?.closest("[contenteditable='true']") as HTMLElement | null;
    if (editor && document.activeElement === editor) return;
    const block = blocks.find((b) => b.id === id);
    if (!block || block.type === "ink") return;
    const startClient = { x: event.clientX, y: event.clientY };
    const origin = point(event);
    const baseX = block.x ?? 0;
    const baseY = block.y ?? 0;
    let dragging = false;
    const onMove = (move: PointerEvent) => {
      if (!dragging) {
        const far =
          Math.abs(move.clientX - startClient.x) + Math.abs(move.clientY - startClient.y) > 4;
        if (!far) return;
        dragging = true;
        const active = document.activeElement as HTMLElement | null;
        if (active && typeof active.blur === "function") active.blur();
      }
      const next = point(move);
      patch(id, {
        x: Math.max(0, baseX + (next.x - origin.x)),
        y: Math.max(0, baseY + (next.y - origin.y)),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startResize(
    id: string,
    event: React.PointerEvent,
    corner: "nw" | "ne" | "sw" | "se" = "se",
  ) {
    event.preventDefault();
    event.stopPropagation();
    const block = blocks.find((b) => b.id === id);
    if (!block || block.type === "ink" || block.type === "audio") return;
    const origin = point(event);
    const baseW = block.w ?? 420;
    const baseH = block.type === "image" ? (block.h ?? 0) : 0;
    const baseX = block.x ?? 0;
    const baseY = block.y ?? 0;
    const ratio = baseH && baseW ? baseH / baseW : 0;
    const west = corner === "nw" || corner === "sw";
    const north = corner === "nw" || corner === "ne";
    const onMove = (move: PointerEvent) => {
      const next = point(move);
      const delta = next.x - origin.x;
      const w = Math.max(80, west ? baseW - delta : baseW + delta);
      const changes: { w: number; h?: number; x?: number; y?: number } = { w };
      if (ratio) changes.h = Math.round(w * ratio);
      if (west) changes.x = Math.max(0, baseX + (baseW - w));
      if (north) changes.y = Math.max(0, baseY + ((ratio ? baseH : 0) - (changes.h ?? 0)));
      patch(id, changes);
    };


    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /** Drag around the image centre to spin it; Shift snaps to 15° steps. */
  function startRotate(id: string, event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const block = blocks.find((b) => b.id === id);
    if (!block || block.type !== "image") return;
    const centre = {
      x: (block.x ?? 0) + (block.w ?? 420) / 2,
      y: (block.y ?? 0) + (block.h ?? 300) / 2,
    };
    const start = point(event);
    const startAngle = Math.atan2(start.y - centre.y, start.x - centre.x);
    const baseRot = block.rot ?? 0;
    const onMove = (move: PointerEvent) => {
      const next = point(move);
      const angle = Math.atan2(next.y - centre.y, next.x - centre.x);
      let deg = baseRot + ((angle - startAngle) * 180) / Math.PI;
      if (move.shiftKey) deg = Math.round(deg / 15) * 15;
      patch(id, { rot: Math.round(((deg % 360) + 360) % 360) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Delete or Backspace may remove a selected image/audio pin, but must never
  // remove an entire text passage while the user is editing its words.

  useEffect(() => {
    if (!canEdit || !selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, button, [contenteditable='true'], [role='textbox']",
        )
      ) {
        return;
      }
      const selected = blocks.find((block) => block.id === selectedId);
      // Text passages may go too, but only when the caret isn't inside them
      // (the target check above already protects an active editor).
      if (!selected || selected.type === "ink") return;
      event.preventDefault();
      remove(selectedId);
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, selectedId, blocks]);

  // Word-style shortcuts: Ctrl/⌘ + Z / Shift+Z / Y step through undo history.
  // B / I / U are handled inside the text box itself so they format only the
  // highlighted words.
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const shortcut = textShortcutOf(event);
      if (shortcut !== "undo" && shortcut !== "redo") return;
      event.preventDefault();
      if (shortcut === "undo") undo();
      else redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, selectedId, blocks, undo, redo]);





  const erasing = useRef(false);

  function eraseAt(at: { x: number; y: number }) {
    const next = blocks.filter(
      (block) => block.type !== "ink" || !strokeHit(block, at),
    );
    if (next.length !== blocks.length) onChange(next);
  }

  function startInk(event: React.PointerEvent) {
    if (!canEdit || (mode !== "draw" && mode !== "highlight" && mode !== "erase")) return;
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    if (mode === "erase") {
      erasing.current = true;
      eraseAt(point(event));
      return;
    }
    drawing.current = true;
    setLive([point(event)]);
  }

  function moveInk(event: React.PointerEvent) {
    if (erasing.current) {
      eraseAt(point(event));
      return;
    }
    if (!drawing.current) return;
    const next = point(event);
    setLive((current) => (current ? [...current, next] : [next]));
  }

  function endInk() {
    if (erasing.current) {
      erasing.current = false;
      return;
    }
    if (!drawing.current) return;
    drawing.current = false;
    const points = live ?? [];
    setLive(null);
    if (points.length < 2) return;
    onChange([
      ...blocks,
      {
        id: crypto.randomUUID(),
        type: "ink",
        d: pathFrom(points),
        color: mode === "highlight" ? highlightColor : penColor,
        width: mode === "highlight" ? CANVAS_HIGHLIGHT_WIDTH : penWidth,
        ...(mode === "highlight" ? { highlight: true } : {}),
        bottom: Math.round(Math.max(...points.map((p) => p.y))),
      },
    ]);
  }

  /** Click any blank spot to start a text box right there, like a Word text cursor. */
  function surfaceClick(event: React.MouseEvent) {
    if (!canEdit || (mode !== "type" && mode !== "select")) return;
    if (event.target !== surfaceRef.current) return;
    // With the arrow, blank space simply lets go of whatever was picked up.
    if (mode === "select" || selectedId) {
      setSelectedId(null);
      return;
    }
    const at = point(event);
    const surfaceWidth = surfaceRef.current?.clientWidth ?? 900;
    const width = Math.max(180, Math.min(760, surfaceWidth - at.x - 24));
    const id = crypto.randomUUID();
    setSelectedId(id);
    setFocusId(id);
    onChange([
      ...blocks,
      { id, type: "text", text: "", x: at.x, y: Math.max(0, at.y - 12), w: width },
    ]);
  }


  const inks = blocks.filter((b): b is Extract<NoteBlock, { type: "ink" }> => b.type === "ink");

  // The stroke being drawn right now travels too, so students watch the pen
  // move instead of waiting for the line to be finished.
  const liveStroke: LiveStroke = live
    ? {
        points: live,
        color: mode === "highlight" ? highlightColor : penColor,
        width: mode === "highlight" ? CANVAS_HIGHLIGHT_WIDTH : penWidth,
        highlight: mode === "highlight",
      }
    : null;
  const [remoteLive, setRemoteLive] = useState<LiveStroke>(null);
  useMirrorField("canvas.live", liveStroke, setRemoteLive, "content");
  const shownLive = liveStroke ?? remoteLive;

  return (
    <div style={{ height: height * zoom, overflow: "hidden", overflowAnchor: "none" }}>
    <div
      ref={surfaceRef}
      onClick={surfaceClick}
      onPointerMove={(event) => onPointerAt?.(point(event))}
      className="relative bg-white"
      style={{
        height,
        width: `${100 / zoom}%`,
        transform: `scale(${zoom})`,
        transformOrigin: "0 0",
      }}
    >

      {/* Ink layer: captures the pen everywhere while in draw mode. */}
      <svg
        className="absolute inset-0 h-full w-full"
        style={{
          pointerEvents:
            canEdit && (mode === "draw" || mode === "highlight" || mode === "erase")
              ? "auto"
              : "none",
          touchAction: "none",
          zIndex: 20,
          cursor: canEdit && mode === "erase" ? "crosshair" : undefined,
        }}
        onPointerDown={startInk}
        onPointerMove={moveInk}
        onPointerUp={endInk}
        onPointerLeave={endInk}
        onPointerCancel={endInk}
      >
        {/* Highlighter blends with the text underneath so it stays readable. */}
        <g style={{ mixBlendMode: "multiply" }}>
          {inks
            .filter((ink) => ink.highlight)
            .map((ink) => (
              <path
                key={ink.id}
                d={ink.d}
                fill="none"
                stroke={ink.color}
                strokeWidth={ink.width}
                strokeOpacity={0.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          {shownLive?.highlight ? (
            <path
              d={pathFrom(shownLive.points)}
              fill="none"
              stroke={shownLive.color}
              strokeWidth={shownLive.width}
              strokeOpacity={0.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </g>
        {inks
          .filter((ink) => !ink.highlight)
          .map((ink) => (
            <path
              key={ink.id}
              d={ink.d}
              fill="none"
              stroke={ink.color}
              strokeWidth={ink.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        {shownLive && !shownLive.highlight ? (
          <path
            d={pathFrom(shownLive.points)}
            fill="none"
            stroke={shownLive.color}
            strokeWidth={shownLive.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>

      {blocks.map((block) => {
        if (block.type === "ink") return null;

        if (block.type === "audio") {
          return (
            <AudioPin
              key={block.id}
              block={block}
              url={imageUrls?.[block.path]}
              canEdit={canEdit}
              selected={selectedId === block.id}
              onSelect={() => setSelectedId(block.id)}
              onMove={(event) => startMove(block.id, event)}
              onDelete={() => remove(block.id)}
            />
          );
        }

        const style = {
          left: block.x ?? 24,
          top: block.y ?? 24,
          width: block.w ?? 480,
        } as React.CSSProperties;


        if (block.type === "text") {
          const isSelectedText = selectedId === block.id;
          const textStyle: React.CSSProperties = {
            fontSize: block.size ?? 15,
            lineHeight: 1.5,
            // Bold / italic / underline live inline on the highlighted words
            // only — never on the whole text box.
            color: block.color ?? undefined,
            textAlign: block.align ?? "left",
          };

          return (
            <div
              key={block.id}
              onPointerDown={
                canEdit
                  ? (event) => {
                      setSelectedId(block.id);
                      startMoveAnywhere(block.id, event);
                    }
                  : undefined
              }
              className={`group absolute ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${block.box ? "rounded-md border border-border bg-background/70 p-2 shadow-sm" : ""}`}
              style={style}
            >

              {canEdit ? (
                <>
                  {/* Wide grab bar across the top: easy to click and drag. */}
                  <div
                    onPointerDown={(event) => {
                      setSelectedId(block.id);
                      startMove(block.id, event);
                    }}
                    title="Drag to move this text"
                    aria-label="Move text"
                    className={`absolute -top-7 -left-2 z-30 flex h-7 w-[calc(100%+1rem)] touch-none cursor-grab items-center justify-center rounded-t-md border border-border bg-muted transition-opacity active:cursor-grabbing ${
                      isSelectedText ? "opacity-100" : "opacity-60 group-hover:opacity-100"
                    }`}
                  >
                    <GripVertical className="size-4 rotate-90 text-muted-foreground" />
                  </div>
                  {/* Left edge strip: another easy place to grab and drag. */}
                  <div
                    onPointerDown={(event) => {
                      setSelectedId(block.id);
                      startMove(block.id, event);
                    }}
                    title="Drag to move this text"
                    aria-label="Move text"
                    className={`absolute -left-3 top-0 z-30 h-full w-3 touch-none cursor-grab rounded-l-md bg-muted transition-opacity active:cursor-grabbing ${
                      isSelectedText ? "opacity-100" : "opacity-0 group-hover:opacity-70"
                    }`}
                  />

                  {isSelectedText ? (
                    <div
                      className="absolute -top-9 left-0 z-40 flex items-center gap-1 rounded-md border bg-background px-1 py-0.5 shadow-sm"
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <select
                        value={block.size ?? 15}
                        onChange={(event) => patch(block.id, { size: Number(event.target.value) })}
                        className="h-6 rounded border bg-background px-1 text-xs"
                        aria-label="Font size"
                      >
                        {[12, 14, 15, 18, 22, 28, 36, 48].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
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
                          // Keep the text selection alive, then format just it.
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => formatSelection(key)}
                          title={`${label} — highlighted text, or the text you type next`}
                          className={`size-6 rounded text-xs ${cls} hover:bg-muted`}
                        >
                          {label}
                        </button>
                      ))}

                      {(["left", "center", "right"] as const).map((align) => (
                        <button
                          key={align}
                          type="button"
                          onClick={() => patch(block.id, { align })}
                          aria-label={`Align ${align}`}
                          className={`size-6 rounded text-[10px] uppercase ${
                            (block.align ?? "left") === align
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          }`}
                        >
                          {align[0]}
                        </button>
                      ))}
                      {TEXT_COLORS.map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => patch(block.id, { color: value })}
                          aria-label={`Text color ${value}`}
                          className={`size-5 rounded-full border ${
                            (block.color ?? TEXT_COLORS[0]) === value ? "ring-2 ring-ring" : ""
                          }`}
                          style={{ backgroundColor: value }}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => patch(block.id, { box: !block.box })}
                        aria-pressed={Boolean(block.box)}
                        className={`size-6 rounded text-[10px] uppercase ${
                          block.box ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        }`}
                        aria-label="Toggle text box border"
                      >
                        ▢
                      </button>
                      <button
                        type="button"
                        onPointerDown={(event) => startMove(block.id, event)}
                        className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted"
                        aria-label="Move text"
                      >
                        <GripVertical className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(block.id)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label="Delete text"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ) : null}
                  <RichTextEditable
                    html={block.html ?? escapeHtml(block.text ?? "")}
                    autoFocus={focusId === block.id}
                    onChange={({ html, text }) => patch(block.id, { html, text })}
                    onFocus={() => {
                      setSelectedId(block.id);
                      if (focusId === block.id) setFocusId(null);
                    }}
                    onBlur={() => {
                      if (!block.box && !block.text.trim()) remove(block.id);
                    }}
                    onUndo={undo}
                    onRedo={redo}
                    placeholder="Type here…"
                    className="w-full border-0 bg-transparent p-1 text-foreground"
                    style={{ ...textStyle, minHeight: 28 }}
                  />
                  <span
                    onPointerDown={(event) => startResize(block.id, event)}
                    className={`absolute -right-2 bottom-0 size-5 touch-none cursor-ew-resize rounded-sm border border-border bg-muted transition-opacity ${
                      isSelectedText ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  />

                </>
              ) : block.html ? (
                <div style={textStyle} dangerouslySetInnerHTML={{ __html: block.html }} />
              ) : (
                <div style={textStyle}>
                  <ClickableText text={block.text} onConcept={onConcept} />
                </div>
              )}

            </div>
          );
        }


        const url = imageUrls?.[block.path];
        const isSelected = selectedId === block.id;
        return (
          <figure
            key={block.id}
            className={`group absolute ${isSelected ? "z-30" : ""}`}
            style={{
              ...style,
              transform: block.rot ? `rotate(${block.rot}deg)` : undefined,
            }}
            onPointerDown={(event) => {
              if (!canEdit) return;
              // Clicking a picture always selects it (so Delete removes it),
              // and only drags it while the pointer is in typing mode.
              setSelectedId(block.id);
              if (mode === "type" || mode === "select") startMove(block.id, event);
            }}
          >
            {url ? (
              <img
                src={url}
                alt={block.caption ?? "Lesson note image"}
                draggable={false}
                className={`w-full select-none rounded-md ${
                  canEdit && (mode === "type" || mode === "select") ? "cursor-move" : ""
                } ${isSelected ? "ring-2 ring-primary" : ""}`}
                style={{ height: block.h ?? "auto" }}
              />
            ) : (
              <div className="h-40 animate-pulse rounded-md border bg-muted" />
            )}
            {canEdit ? (
              <>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(block.id);
                  }}
                  className={`absolute -right-2 -top-2 rounded-full border bg-background p-1 text-muted-foreground shadow-sm transition-opacity hover:text-destructive ${
                    isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  aria-label="Delete image"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => startRotate(block.id, event)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    patch(block.id, { rot: (((block.rot ?? 0) + 90) % 360) });
                  }}
                  className={`absolute -top-8 left-1/2 -translate-x-1/2 cursor-grab rounded-full border bg-background p-1 text-muted-foreground shadow-sm transition-opacity hover:text-primary ${
                    isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  aria-label="Rotate image"
                  title="Drag to rotate (Shift snaps to 15°), double-click for 90°"
                >
                  <RotateCw className="size-3.5" />
                </button>
                {(
                  [
                    ["nw", "-left-1.5 -top-1.5 cursor-nwse-resize"],
                    ["ne", "-right-1.5 -top-1.5 cursor-nesw-resize"],
                    ["sw", "-left-1.5 -bottom-1.5 cursor-nesw-resize"],
                    ["se", "-right-1.5 -bottom-1.5 cursor-nwse-resize"],
                  ] as const
                ).map(([corner, cls]) => (
                  <span
                    key={corner}
                    onPointerDown={(event) => {
                      setSelectedId(block.id);
                      startResize(block.id, event, corner);
                    }}
                    className={`absolute size-3 rounded-sm border border-primary bg-background transition-opacity ${cls} ${
                      isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  />
                ))}
              </>
            ) : null}
          </figure>
        );

      })}

      {canEdit && blocks.length === 0 ? (
        <p className="pointer-events-none absolute left-6 top-6 text-sm text-muted-foreground">
          Click anywhere to type. Switch to Draw to write with a pen. Paste images straight in.
        </p>
      ) : null}
    </div>
    </div>
  );
}

/**
 * Small floating speaker pin for a teacher voice note. Teachers can drag it
 * anywhere on the sheet; anyone can click it to replay the recording.
 */
function AudioPin({
  block,
  url,
  canEdit,
  selected,
  onSelect,
  onMove,
  onDelete,
}: {
  block: Extract<NoteBlock, { type: "audio" }>;
  url: string | undefined;
  canEdit: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (event: React.PointerEvent) => void;
  onDelete: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    void el.play().catch(() => setPlaying(false));
  }

  const seconds = Math.round(block.seconds ?? 0);
  const length = seconds
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : "";

  return (
    <div
      className={`group absolute z-30 flex items-center gap-1 rounded-full border bg-background/95 px-2 py-1 shadow-md ${
        selected ? "ring-2 ring-primary" : ""
      }`}
      style={{ left: block.x ?? 24, top: block.y ?? 24 }}
      onPointerDown={onSelect}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        className="flex items-center gap-1 rounded-full px-1 text-primary disabled:opacity-50"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        title={block.label ?? "Voice note"}
      >
        {playing ? <Pause className="size-4" /> : <Volume2 className="size-4" />}
        <span className="text-xs font-medium text-foreground">{length || "Voice note"}</span>
      </button>
      {canEdit ? (
        <>
          <span
            onPointerDown={onMove}
            className="cursor-grab text-muted-foreground"
            aria-label="Move voice note"
          >
            <GripVertical className="size-3.5" />
          </span>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete voice note"
          >
            <Trash2 className="size-3.5" />
          </button>
        </>
      ) : null}
      {url ? (
        <audio
          ref={audioRef}
          src={url}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      ) : null}
    </div>
  );
}
