import {
  Download,
  Eraser,
  Highlighter,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  RefreshCw,
  SquarePen,
  Type,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  emptyAnnotation,
  SlideAnnotations,
  type SlideAnnotation,
  type SlideTool,
} from "@/components/materials/SlideAnnotations";
import {
  DocMarkupSurface,
  DocMarkupToolbar,
  HIGHLIGHT_SWATCHES,
} from "@/components/materials/DocMarkupLayer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clearCachedDoc, readCachedJson, writeCachedJson } from "@/lib/doc-cache";
import { scopedKey, useMarkupScope } from "@/lib/markup-scope";

import {
  buildOfficeRender,
  fetchSharedRender,
  saveSharedRender,
} from "@/lib/office-prerender";
import { type PptxDeck, type PptxShape } from "@/lib/pptx-render";

/** A teacher's change to one slide element: retyped text, or a moved/resized box. */
export type ShapeEdit = { text?: string; x?: number; y?: number; w?: number; h?: number };



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
  materialId,
  canPrepareShared = false,
  canDownload = true,
}: {
  url: string;
  title: string;
  format: "pptx" | "docx";
  cacheKey?: string;
  /** Enables the shared, prepared-once render stored alongside the file. */
  materialId?: string;
  /** Teachers may store the prepared render for everyone else. */
  canPrepareShared?: boolean;
  canDownload?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [html, setHtml] = useState<string>("");
  const [deck, setDeck] = useState<PptxDeck | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  // Increment when the renderer changes so old, incorrectly parsed decks are
  // never served forever from IndexedDB after a fidelity fix.
  const key = `office-render-v5:${format}:${cacheKey ?? title}`;
  // Marks and slide edits are personal to the account viewing them.
  const { ready: scopeReady, scope } = useMarkupScope();
  const notesKey = scopedKey(`office-annotations:${format}:${cacheKey ?? title}`, scope);
  const editsKey = scopedKey(`office-shape-edits:${format}:${cacheKey ?? title}`, scope);


  // Drawings and text boxes made on top of the slides, kept per slide index and
  // saved locally so they are still there next lesson.
  const [tool, setTool] = useState<SlideTool>("none");
  const [penColor, setPenColor] = useState("#dc2626");
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_SWATCHES[0]!);
  const [notes, setNotes] = useState<Record<number, SlideAnnotation>>({});
  const [edits, setEdits] = useState<Record<string, ShapeEdit>>({});
  const [currentSlide, setCurrentSlide] = useState(0);
  // Word documents are one long flow, so the markup layer covers the whole page.
  const docRef = useRef<HTMLDivElement | null>(null);
  const [docRatio, setDocRatio] = useState(1.414);

  useEffect(() => {
    const el = docRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setDocRatio(rect.height / rect.width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [html, status]);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!scopeReady) return;
    let cancelled = false;
    void (async () => {
      const saved = await readCachedJson<Record<number, SlideAnnotation>>(notesKey);
      if (!cancelled) setNotes(saved ?? {});
      const savedEdits = await readCachedJson<Record<string, ShapeEdit>>(editsKey);
      if (!cancelled) setEdits(savedEdits ?? {});
    })();
    return () => {
      cancelled = true;
    };
  }, [notesKey, editsKey, scopeReady]);


  function updateNotes(index: number, next: SlideAnnotation) {
    setNotes((current) => {
      const merged = { ...current, [index]: next };
      void writeCachedJson(notesKey, merged);
      return merged;
    });
  }

  // Edits the teacher makes directly to slide elements (retyped text, resized or
  // moved boxes) are stored per shape and layered over the parsed deck.
  function updateEdit(slideIndex: number, shapeIndex: number, patch: ShapeEdit) {
    setEdits((current) => {
      const id = `${slideIndex}:${shapeIndex}`;
      const merged = { ...current, [id]: { ...current[id], ...patch } };
      void writeCachedJson(editsKey, merged);
      return merged;
    });
  }


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

  // Track which slide is most visible while scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !deck) return;
    const ratios = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number((entry.target as HTMLElement).dataset["slideIndex"]);
          ratios.set(index, entry.intersectionRatio);
        });
        let best = 0;
        let bestRatio = -1;
        ratios.forEach((ratio, index) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = index;
          }
        });
        // Nothing is on screen (the browser tab is in the background, or the
        // pane is hidden): keep the slide we were on instead of jumping to the
        // first one.
        if (bestRatio <= 0) return;
        setCurrentSlide(best);
      },
      { root: el, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    slideRefs.current.forEach((node) => {
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [deck]);

  // Dragging the split-view divider changes this pane's width, which rescales
  // every slide and would otherwise slide the view onto a different slide.
  // Re-pin the slide that was on screen after each width change.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !deck) return;
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      // A hidden pane or background tab reports 0: never re-pin on that.
      if (!width || width === lastWidth) return;
      lastWidth = width;
      requestAnimationFrame(() => {
        const node = slideRefs.current[currentSlide];
        if (!node) return;
        const top = node.getBoundingClientRect().top - el.getBoundingClientRect().top;
        el.scrollTop = Math.max(0, el.scrollTop + top - 8);
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [deck, currentSlide]);


  // The download address can be refreshed while the resource stays the same;
  // reading it from a ref keeps a new address from reloading (and rescrolling)
  // what the teacher is looking at.
  const urlRef = useRef(url);
  urlRef.current = url;

  useEffect(() => {
    const run = ++token.current;
    let cancelled = false;
    const live = () => !cancelled && run === token.current;
    setStatus("loading");
    setProgress(null);
    setHtml("");
    setDeck(null);

    (async () => {
      // 1. This device has already opened it: no download, no parsing.
      const cached = await readCachedJson<PptxDeck | string>(key);
      if (!live()) return;
      if (cached) {
        if (format === "pptx" && typeof cached === "object") setDeck(cached);
        else if (format === "docx" && typeof cached === "string") setHtml(cached);
        setStatus("ready");
        return;
      }

      // 2. Someone has already prepared this resource: download the finished
      //    render instead of rebuilding the file.
      if (materialId) {
        const shared = await fetchSharedRender(materialId);
        if (!live()) return;
        if (shared) {
          if (shared.format === "pptx" && format === "pptx") {
            setDeck(shared.deck);
            void writeCachedJson(key, shared.deck);
          } else if (shared.format === "docx" && format === "docx") {
            setHtml(shared.html);
            void writeCachedJson(key, shared.html);
          }
          setStatus("ready");
          return;
        }
      }

      // 3. Build it here, showing slides as they become ready.
      try {
        const response = await fetch(urlRef.current);
        if (!response.ok) throw new Error(`Download failed (${response.status})`);
        const buffer = await response.arrayBuffer();
        if (!live()) return;

        const render = await buildOfficeRender(buffer, format, {
          onSlide: (_slide, index, total) => {
            if (!live()) return;
            setProgress({ done: index + 1, total });
          },
          onPartialDeck: (partial) => {
            if (!live()) return;
            setDeck(partial);
            setStatus("ready");
          },
        });
        if (!live()) return;

        if (render.format === "docx") {
          setHtml(render.html);
          void writeCachedJson(key, render.html);
        } else {
          setDeck(render.deck);
          void writeCachedJson(key, render.deck);
        }
        setStatus("ready");
        setProgress(null);
        // Share the finished render so nobody else pays this cost.
        if (materialId && canPrepareShared) void saveSharedRender(materialId, render);
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [format, key, rebuilding, materialId, canPrepareShared]);

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
            Slide {currentSlide + 1} of {progress?.total ?? deck.slides.length}
            {progress && progress.done < progress.total ? " · still preparing…" : ""}
          </span>
        ) : null}
        {deck ? (
          <div className="ml-2 flex items-center gap-1">
            {(
              [
                ["none", "Select", MousePointer2],
                ["edit", "Edit slide text and boxes", SquarePen],
                ["draw", "Draw on slides", PenLine],
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
            {(tool === "highlight"
              ? HIGHLIGHT_SWATCHES
              : ["#dc2626", "#2563eb", "#16a34a", "#111827"]
            ).map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`${tool === "highlight" ? "Highlighter" : "Pen"} colour ${swatch}`}
                onClick={() =>
                  tool === "highlight" ? setHighlightColor(swatch) : setPenColor(swatch)
                }
                className={`size-5 rounded-full border-2 ${
                  (tool === "highlight" ? highlightColor : penColor) === swatch
                    ? "scale-110 border-foreground"
                    : "border-border"
                }`}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        ) : null}
        {!deck && status === "ready" ? (
          <DocMarkupToolbar
            tool={tool}
            setTool={setTool}
            penColor={penColor}
            setPenColor={setPenColor}
            highlightColor={highlightColor}
            setHighlightColor={setHighlightColor}
          />
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
            {progress ? (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Slide {progress.done} of {progress.total}
                </p>
              </div>
            ) : null}
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
                <div
                  key={index}
                  data-slide-index={index}
                  ref={(node) => {
                    slideRefs.current[index] = node;
                  }}
                >
                  <SlidePage
                    deck={deck}
                    index={index}
                    tool={tool}
                    penColor={penColor}
                    highlightColor={highlightColor}
                    annotation={notes[index] ?? emptyAnnotation}
                    onAnnotationChange={(next) => updateNotes(index, next)}
                    edits={edits}
                    onEdit={(shapeIndex, patch) => updateEdit(index, shapeIndex, patch)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ width: `${zoom * 100}%` }}>
              <DocMarkupSurface
                ratio={docRatio}
                tool={tool}
                penColor={penColor}
                highlightColor={highlightColor}
                value={notes[0] ?? emptyAnnotation}
                onChange={(next) => updateNotes(0, next)}
              >
                <div
                  ref={docRef}
                  className="office-doc rounded-md border bg-white p-6 text-sm leading-relaxed text-black shadow-sm"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </DocMarkupSurface>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function SlidePage({
  deck,
  index,
  tool,
  penColor,
  highlightColor,
  annotation,
  onAnnotationChange,
  edits,
  onEdit,
}: {
  deck: PptxDeck;
  index: number;
  tool: SlideTool;
  penColor: string;
  highlightColor?: string | undefined;
  annotation: SlideAnnotation;
  onAnnotationChange: (next: SlideAnnotation) => void;
  edits: Record<string, ShapeEdit>;
  onEdit: (shapeIndex: number, patch: ShapeEdit) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // The slide is laid out at its native size and scaled to the pane width.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const apply = () => setScale(el.clientWidth / deck.width);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [deck.width]);

  const slide = deck.slides[index];
  if (!slide) return null;
  return (
    <div className="relative overflow-hidden rounded-md border shadow-sm">
      <div
        ref={frameRef}
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
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {slide.shapes.map((shape, i) => (
            <SlideShape
              key={i}
              shape={shape}
              slideWidth={deck.width}
              widthLimit={boundsFor(slide.shapes, i, deck.width, deck.height).right}
              heightLimit={boundsFor(slide.shapes, i, deck.width, deck.height).bottom}
              editable={tool === "edit"}
              scale={scale}
              edit={edits[`${index}:${i}`]}
              onEdit={(patch) => onEdit(i, patch)}
            />
          ))}

          <SlideAnnotations
            width={deck.width}
            height={deck.height}
            tool={tool}
            color={penColor}
            highlightColor={highlightColor}
            value={annotation}
            onChange={onAnnotationChange}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * How far a text box may grow before it would run into a neighbouring box or a
 * picture. PowerPoint never lets one box's words cross another shape, so
 * neither do we: side-by-side columns stay in their own lanes and words never
 * sit on top of an image.
 */
function boundsFor(shapes: PptxShape[], index: number, slideWidth: number, slideHeight: number) {
  const self = shapes[index];
  if (!self || self.type !== "text") return { right: slideWidth, bottom: slideHeight };
  let right = slideWidth - 8;
  let bottom = slideHeight - 4;
  shapes.forEach((other, i) => {
    if (i === index || other.type === "shape") return;
    if (!other.w || !other.h) return;
    if (other.type === "text" && !other.paragraphs.some((p) => p.runs.some((r) => r.text.trim()))) {
      return;
    }
    const verticalOverlap = other.y < self.y + self.h - 2 && other.y + other.h > self.y + 2;
    if (verticalOverlap && other.x + 2 > self.x) right = Math.min(right, other.x);
    const horizontalOverlap = other.x < self.x + self.w - 2 && other.x + other.w > self.x + 2;
    if (horizontalOverlap && other.y + 2 > self.y) bottom = Math.min(bottom, other.y);
  });
  return {
    right: Math.max(right, self.x + Math.max(self.w, 20)),
    bottom: Math.max(bottom, self.y + Math.max(self.h, 16)),
  };
}

function SlideShape({
  shape,
  slideWidth,
  widthLimit,
  heightLimit,
  editable,
  scale,
  edit,
  onEdit,
}: {
  shape: PptxShape;
  slideWidth: number;
  widthLimit?: number;
  heightLimit?: number;
  editable: boolean;
  scale: number;
  edit?: ShapeEdit | undefined;
  onEdit: (patch: ShapeEdit) => void;
}) {
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

  return (
    <TextShape
      shape={shape}
      slideWidth={slideWidth}
      widthLimit={widthLimit}
      heightLimit={heightLimit}
      editable={editable}
      scale={scale}
      edit={edit}
      onEdit={onEdit}
      rotate={rotate}
    />
  );
}

/**
 * A slide text box. Copy that doesn't fit is widened only into free space (never
 * across a neighbouring box, which would overlap the words), then shrunk to fit.
 * With the Edit tool on, the teacher can retype the text and drag the box to
 * move or resize it.
 */
function TextShape({
  shape,
  slideWidth,
  widthLimit,
  heightLimit,
  editable,
  scale,
  edit,
  onEdit,
  rotate,
}: {
  shape: Extract<PptxShape, { type: "text" }>;
  slideWidth: number;
  widthLimit?: number | undefined;
  heightLimit?: number | undefined;
  editable: boolean;
  scale: number;
  edit?: ShapeEdit | undefined;
  onEdit: (patch: ShapeEdit) => void;
  rotate?: string | undefined;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const x = edit?.x ?? shape.x;
  const y = edit?.y ?? shape.y;
  const baseW = edit?.w ?? shape.w;
  const baseH = edit?.h ?? shape.h;
  const overrideText = edit?.text;
  // Right-hand boundary: the nearest neighbour's left edge, or the slide edge.
  const rightBound = Math.min(widthLimit ?? slideWidth - 8, slideWidth - 8);
  // Bottom boundary: the nearest picture or box below, so words never sit on it.
  const bottomBound = edit?.h ? null : (heightLimit ?? null);
  const roomBelow = bottomBound == null ? null : Math.max(24, bottomBound - y - 2);

  // Fit the copy inside the box: widen into free space first, then shrink.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    box.style.width = baseW ? `${baseW}px` : "auto";
    inner.style.width = "100%";
    inner.style.transform = "";
    if (!baseW || !baseH) return;

    let width = baseW;
    const maxWidth = Math.max(baseW, (edit?.w ? slideWidth - x - 8 : rightBound) - x);
    const step = Math.max(40, baseW * 0.12);
    let height = inner.scrollHeight;
    while (height > baseH + 2 && width < maxWidth) {
      width = Math.min(maxWidth, width + step);
      box.style.width = `${width}px`;
      height = inner.scrollHeight;
    }
    // Never let the copy spill onto whatever sits below (a picture or another
    // box): shrink to the free space instead of overflowing into it.
    const allowed = roomBelow == null ? baseH : Math.min(baseH, roomBelow);
    if (height > allowed + 2) {
      const shrink = Math.max(0.3, allowed / height);
      inner.style.width = `${width / shrink}px`;
      inner.style.transform = `scale(${shrink})`;
    }
  }, [baseW, baseH, x, slideWidth, rightBound, roomBelow, edit?.w, overrideText, shape]);


  function startDrag(mode: "move" | "resize", event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      x,
      y,
      w: baseW || 200,
      h: baseH || 80,
    };
  }

  function onDragMove(event: React.PointerEvent) {
    const state = drag.current;
    if (!state) return;
    const dx = (event.clientX - state.startX) / (scale || 1);
    const dy = (event.clientY - state.startY) / (scale || 1);
    if (state.mode === "move") {
      onEdit({ x: Math.round(state.x + dx), y: Math.round(state.y + dy) });
    } else {
      onEdit({
        w: Math.max(60, Math.round(state.w + dx)),
        h: Math.max(30, Math.round(state.h + dy)),
      });
    }
  }

  function endDrag() {
    drag.current = null;
  }

  const [lIns, tIns, rIns, bIns] = shape.insets;
  const firstRun = shape.paragraphs[0]?.runs[0];
  const firstParagraph = shape.paragraphs[0];

  return (
    <div
      ref={boxRef}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: baseW || undefined,
        height: baseH || undefined,
        transform: rotate,
        display: "flex",
        flexDirection: "column",
        justifyContent:
          shape.anchor === "ctr" ? "center" : shape.anchor === "b" ? "flex-end" : "flex-start",
        padding: `${tIns}px ${rIns}px ${bIns}px ${lIns}px`,
        background: shape.fill ?? undefined,
        border: shape.line ? `${shape.line.width}px solid ${shape.line.color}` : undefined,
        outline: editable ? "1px dashed hsl(var(--primary))" : undefined,
        borderRadius: shape.radius || undefined,
        boxSizing: "border-box",
        color: "#111",
        overflow: roomBelow != null && roomBelow < baseH ? "hidden" : "visible",
      }}
    >
      <div ref={innerRef} style={{ transformOrigin: "top left" }}>
        <div
          contentEditable={editable}
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={(event) => {
            if (!editable) return;
            const next = (event.currentTarget as HTMLElement).innerText.replace(/\u00a0/g, " ");
            const current =
              overrideText ??
              shape.paragraphs
                .map((p) => (p.bullet ? `${p.bullet} ` : "") + p.runs.map((r) => r.text).join(""))
                .join("\n");
            if (next !== current) onEdit({ text: next });
          }}
          style={{ outline: "none", cursor: editable ? "text" : undefined }}
        >
          {overrideText != null
            ? overrideText.split("\n").map((line, li) => (
                <p
                  key={li}
                  style={{
                    margin: 0,
                    textAlign:
                      firstParagraph?.align === "ctr"
                        ? "center"
                        : firstParagraph?.align === "r"
                          ? "right"
                          : "left",
                    lineHeight: firstParagraph?.lineHeight ?? 1.2,
                    fontSize: firstRun?.size,
                    fontFamily: firstRun?.font
                      ? `"${firstRun.font}", system-ui, sans-serif`
                      : undefined,
                    fontWeight: firstRun?.bold ? 700 : 400,
                    fontStyle: firstRun?.italic ? "italic" : undefined,
                    color: firstRun?.color ?? undefined,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    minHeight: line === "" ? "0.75em" : undefined,
                  }}
                >
                  {line}
                </p>
              ))
            : shape.paragraphs.map((paragraph, pi) => (
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
      </div>

      {editable ? (
        <>
          <div
            role="button"
            tabIndex={-1}
            aria-label="Move this text box"
            title="Drag to move"
            onPointerDown={(event) => startDrag("move", event)}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              position: "absolute",
              left: -10,
              top: -10,
              width: 20,
              height: 20,
              borderRadius: 999,
              background: "hsl(var(--primary))",
              cursor: "move",
              touchAction: "none",
            }}
          />
          <div
            role="button"
            tabIndex={-1}
            aria-label="Resize this text box"
            title="Drag to resize"
            onPointerDown={(event) => startDrag("resize", event)}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              position: "absolute",
              right: -10,
              bottom: -10,
              width: 20,
              height: 20,
              background: "hsl(var(--primary))",
              cursor: "nwse-resize",
              touchAction: "none",
            }}
          />
        </>
      ) : null}
    </div>
  );
}
