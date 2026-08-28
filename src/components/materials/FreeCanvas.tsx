import { GripVertical, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import type { NoteBlock } from "@/lib/notes.functions";

export type CanvasMode = "type" | "draw" | "erase";

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
  penWidth,
  imageUrls,
  onChange,
  onConcept,
}: {
  blocks: NoteBlock[];
  canEdit: boolean;
  mode: CanvasMode;
  penColor: string;
  penWidth: number;
  imageUrls: Record<string, string> | undefined;
  onChange: (next: NoteBlock[]) => void;
  onConcept: (value: string) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState<Array<{ x: number; y: number }> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drawing = useRef(false);


  const bottom = blocks.reduce((max, block) => {
    if (block.type === "ink") return Math.max(max, block.bottom ?? 0);
    const height = block.type === "image" ? (block.h ?? 300) : 200;
    return Math.max(max, (block.y ?? 0) + height);
  }, 0);
  const height = Math.max(1800, bottom + 700);

  function point(event: { clientX: number; clientY: number }) {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function patch(id: string, changes: Partial<Extract<NoteBlock, { type: "image" | "text" }>>) {
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

  function startResize(
    id: string,
    event: React.PointerEvent,
    corner: "nw" | "ne" | "sw" | "se" = "se",
  ) {
    event.preventDefault();
    event.stopPropagation();
    const block = blocks.find((b) => b.id === id);
    if (!block || block.type === "ink") return;
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
      const changes: Record<string, number> = { w };
      if (ratio) changes.h = Math.round(w * ratio);
      if (west) changes.x = Math.max(0, baseX + (baseW - w));
      if (north) changes.y = Math.max(0, baseY + ((ratio ? baseH : 0) - (changes.h ?? 0)));
      patch(id, changes as Partial<Extract<NoteBlock, { type: "image" | "text" }>>);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Delete or Backspace removes the selected image (Word-like behaviour).
  useEffect(() => {
    if (!canEdit || !selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA/.test(target.tagName)) return;
      event.preventDefault();
      remove(selectedId);
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, selectedId, blocks]);


  const erasing = useRef(false);

  function eraseAt(at: { x: number; y: number }) {
    const next = blocks.filter(
      (block) => block.type !== "ink" || !strokeHit(block, at),
    );
    if (next.length !== blocks.length) onChange(next);
  }

  function startInk(event: React.PointerEvent) {
    if (!canEdit || (mode !== "draw" && mode !== "erase")) return;
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
        color: penColor,
        width: penWidth,
        bottom: Math.round(Math.max(...points.map((p) => p.y))),
      },
    ]);
  }

  function surfaceClick(event: React.MouseEvent) {
    if (!canEdit || mode !== "type") return;
    if (event.target !== surfaceRef.current) return;
    const at = point(event);
    onChange([
      ...blocks,
      { id: crypto.randomUUID(), type: "text", text: "", x: at.x, y: at.y, w: 480 },
    ]);
  }

  const inks = blocks.filter((b): b is Extract<NoteBlock, { type: "ink" }> => b.type === "ink");

  return (
    <div
      ref={surfaceRef}
      onClick={surfaceClick}
      className="relative w-full bg-white"
      style={{ height }}
    >
      {/* Ink layer: captures the pen everywhere while in draw mode. */}
      <svg
        className="absolute inset-0 h-full w-full"
        style={{
          pointerEvents: canEdit && (mode === "draw" || mode === "erase") ? "auto" : "none",
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
        {inks.map((ink) => (
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
        {live ? (
          <path
            d={pathFrom(live)}
            fill="none"
            stroke={penColor}
            strokeWidth={penWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>

      {blocks.map((block) => {
        if (block.type === "ink") return null;
        const style = {
          left: block.x ?? 24,
          top: block.y ?? 24,
          width: block.w ?? 480,
        } as React.CSSProperties;

        if (block.type === "text") {
          return (
            <div key={block.id} className="group absolute" style={style}>
              {canEdit ? (
                <>
                  <textarea
                    value={block.text}
                    onChange={(event) => patch(block.id, { text: event.target.value })}
                    placeholder="Type here…"
                    rows={1}
                    className="w-full resize-none border-0 bg-transparent p-1 text-sm leading-relaxed text-foreground outline-none focus:ring-0"
                    style={{ height: "auto", minHeight: 28 }}
                    onInput={(event) => {
                      const el = event.currentTarget;
                      el.style.height = "auto";
                      el.style.height = `${el.scrollHeight}px`;
                    }}
                    ref={(el) => {
                      if (el) {
                        el.style.height = "auto";
                        el.style.height = `${el.scrollHeight}px`;
                      }
                    }}
                  />
                  <div className="absolute -left-6 top-0 flex flex-col opacity-0 transition-opacity group-hover:opacity-100">
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
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                      aria-label="Delete text"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <span
                    onPointerDown={(event) => startResize(block.id, event)}
                    className="absolute -right-1 bottom-0 size-3 cursor-ew-resize rounded-sm bg-border opacity-0 group-hover:opacity-100"
                  />
                </>
              ) : (
                <ClickableText text={block.text} onConcept={onConcept} />
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
            style={style}
            onPointerDown={(event) => {
              if (!canEdit || mode !== "type") return;
              setSelectedId(block.id);
              startMove(block.id, event);
            }}
          >
            {url ? (
              <img
                src={url}
                alt={block.caption ?? "Lesson note image"}
                draggable={false}
                className={`w-full select-none rounded-md ${
                  canEdit && mode === "type" ? "cursor-move" : ""
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
  );
}
