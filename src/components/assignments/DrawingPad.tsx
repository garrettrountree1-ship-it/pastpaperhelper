import {
  Eraser,
  Expand,
  Hand,
  ImageMinus,
  ImagePlus,
  Minimize,
  PenLine,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { mergeSnipPieces, parseSnipBand } from "@/components/assignments/QuestionSnip";
import { questionPagesOnly } from "@/lib/answer-key";
import { snapBandToWhitespace } from "@/lib/snip-whitespace";

import { Button } from "@/components/ui/button";

type Stroke = { points: Array<{ x: number; y: number }>; width: number; color: string };

const PEN_COLORS = [
  { name: "Black", value: "#111827" },
  { name: "Red", value: "#dc2626" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Orange", value: "#ea580c" },
  { name: "Purple", value: "#7c3aed" },
];

const MAX_SHEET = 6000;
/** One fixed name so a new save replaces the last pad picture, never stacks. */
export const PAD_FILE_NAME = "working-pad.png";



/**
 * Stylus / finger / mouse writing pad for working out calculations on screen
 * (e.g. an iPad with an Apple Pencil). The finished sheet is attached as an
 * image file exactly like an uploaded photo, so marking is unchanged.
 * The student can only write, drag the question picture, and make that picture
 * bigger or smaller — nothing zooms the pad itself.

 * When `backgroundUrls` are given, the pad can be opened full screen with the
 * question picture printed underneath so the student writes straight onto it.
 */
export function DrawingPad({
  disabled = false,
  backgroundUrls = [],
  onAttach,
}: {
  disabled?: boolean;
  /** Question picture(s) shown faintly under the ink in full screen. */
  backgroundUrls?: string[];
  onAttach: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawing = useRef(false);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const resizing = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startScale: number;
    corner: "nw" | "ne" | "sw" | "se";
  } | null>(null);
  /** Top-left of the picture when a resize starts, so the opposite corner stays put. */
  const resizeOrigin = useRef({ x: 0, y: 0 });
  const dprRef = useRef(1);
  // Where the student has dragged the question picture to. Only the picture
  // moves — their writing stays exactly where they put it.
  const offsetRef = useRef({ x: 0, y: 0 });

  const [hasInk, setHasInk] = useState(false);
  const [full, setFull] = useState(false);
  const [mode, setMode] = useState<"draw" | "move">("draw");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // True while the student has tapped the question picture: it is outlined with
  // corner handles and can be dragged around or made bigger / smaller.
  const [selected, setSelected] = useState(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // The sheet is as long as the student needs: it stretches while they scroll
  // down and shrinks back to the work when they come back up.
  const [sheetHeight, setSheetHeight] = useState(0);
  // Each piece is the picture plus the exact band of the page shown in the
  // question box, so the pad can never reveal print outside that question.
  const backgroundsRef = useRef<
    Array<{ image: HTMLImageElement; top: number; bottom: number }>
  >([]);
  // Open every homework and quiz question at a compact size so the picture
  // never fills the pad. Students can still enlarge it with the picture controls
  // or corner handles.
  const [photoScale, setPhotoScale] = useState(0.25);
  const photoScaleRef = useRef(photoScale);
  photoScaleRef.current = photoScale;
  const [saved, setSaved] = useState(false);
  const [hoverCorner, setHoverCorner] = useState<"nw" | "ne" | "sw" | "se" | null>(null);
  /** Small picture of the last saved sheet, shown under the closed pad. */
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  const saveTimer = useRef(0);
  const [color, setColor] = useState(PEN_COLORS[0]!.value);
  const colorRef = useRef(color);
  colorRef.current = color;

  const HANDLE = 14;

  /** On-screen box the question picture currently fills. */
  function pictureRect() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const width = (canvas.width / dprRef.current) * photoScaleRef.current;
    let height = 0;
    for (const piece of backgroundsRef.current) {
      const image = piece.image;
      if (!image.complete || !image.naturalWidth) continue;
      const sh = Math.max(1, (piece.bottom - piece.top) * image.naturalHeight);
      height += (width * sh) / image.naturalWidth + 8;
    }
    if (height <= 0) return null;
    return { x: offsetRef.current.x, y: offsetRef.current.y, width, height };
  }

  function hitPicture(point: { x: number; y: number }) {
    const rect = pictureRect();
    if (!rect) return false;
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }

  /** Bottom-right (or any corner) grab square that resizes the picture. */
  function hitHandle(point: { x: number; y: number }) {
    return hitHandleCorner(point) !== null;
  }

  function hitHandleCorner(point: { x: number; y: number }) {
    const rect = pictureRect();
    if (!rect || !selectedRef.current) return null;
    const corners: Array<{ key: "nw" | "ne" | "sw" | "se"; x: number; y: number }> = [
      { key: "nw", x: rect.x, y: rect.y },
      { key: "ne", x: rect.x + rect.width, y: rect.y },
      { key: "sw", x: rect.x, y: rect.y + rect.height },
      { key: "se", x: rect.x + rect.width, y: rect.y + rect.height },
    ];
    for (const corner of corners) {
      if (
        Math.abs(point.x - corner.x) <= HANDLE &&
        Math.abs(point.y - corner.y) <= HANDLE
      ) {
        return corner.key;
      }
    }
    return null;
  }

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    // The question picture sits under the ink so the work is marked in context.
    ctx.save();
    ctx.translate(offsetRef.current.x, offsetRef.current.y);
    const padWidth = (canvas.width / dpr) * photoScaleRef.current;
    let y = 0;
    for (const piece of backgroundsRef.current) {
      const image = piece.image;
      if (!image.complete || !image.naturalWidth) continue;
      const sy = piece.top * image.naturalHeight;
      const sh = Math.max(1, (piece.bottom - piece.top) * image.naturalHeight);
      const h = (padWidth * sh) / image.naturalWidth;
      ctx.drawImage(image, 0, sy, image.naturalWidth, sh, 0, y, padWidth, h);
      y += h + 8;
    }
    ctx.restore();

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of strokesRef.current) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.beginPath();

      stroke.points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }

    // Highlight the picture last so the outline and grab squares stay visible.
    const rect = selectedRef.current ? pictureRect() : null;
    if (rect) {
      ctx.save();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      ctx.setLineDash([]);
      ctx.fillStyle = "#2563eb";
      for (const corner of [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.width, y: rect.y },
        { x: rect.x, y: rect.y + rect.height },
        { x: rect.x + rect.width, y: rect.y + rect.height },
      ]) {
        ctx.fillRect(corner.x - 5, corner.y - 5, 10, 10);
      }
      ctx.restore();
    }
  }



  /** Lowest point of the picture / ink, in on-screen pixels. */
  function contentBottom() {
    const canvas = canvasRef.current;
    let bottom = 0;
    if (canvas) {
      const padWidth = (canvas.width / dprRef.current) * photoScaleRef.current;
      let y = 0;
      for (const piece of backgroundsRef.current) {
        const image = piece.image;
        if (!image.complete || !image.naturalWidth) continue;
        const sh = Math.max(1, (piece.bottom - piece.top) * image.naturalHeight);
        y += (padWidth * sh) / image.naturalWidth + 8;
      }
      bottom = y;
    }
    for (const stroke of strokesRef.current) {
      for (const point of stroke.points) bottom = Math.max(bottom, point.y);
    }
    return bottom + Math.max(0, offsetRef.current.y);
  }

  /** Grows the sheet while the student scrolls down, shrinks back on the way up. */
  function updateSheet() {
    const box = scrollRef.current;
    if (!full || !box) return;
    const view = box.clientHeight || 600;
    const wanted = Math.max(
      view,
      contentBottom() + view * 0.6,
      box.scrollTop + view * 1.5,
    );
    setSheetHeight((current) =>
      Math.abs(current - wanted) < 40 ? current : Math.min(MAX_SHEET, Math.round(wanted)),
    );
  }

  // Size the bitmap to the element so strokes land under the pen tip.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [full, sheetHeight]);

  // Start the long sheet as soon as full screen opens.
  useEffect(() => {
    if (!full) {
      setSheetHeight(0);
      return;
    }
    const id = window.setTimeout(() => {
      const view = scrollRef.current?.clientHeight || 600;
      setSheetHeight(Math.round(view * 1.5));
    }, 0);
    return () => window.clearTimeout(id);
  }, [full]);


  // Load the question picture(s) for the full-screen pad.
  useEffect(() => {
    if (!full || backgroundUrls.length === 0) {
      backgroundsRef.current = [];
      redraw();
      return;
    }
    let cancelled = false;
    // Exactly the pieces the question box shows: answer-key pages left out,
    // repeated pieces merged, and only the band belonging to this question.
    const pieces = mergeSnipPieces(questionPagesOnly(backgroundUrls)).slice(0, 3);
    const loaded = pieces.map((url) => {
      const band = parseSnipBand(url) ?? { top: 0, bottom: 1 };
      const image = new Image();
      const entry = { image, top: band.top, bottom: band.bottom };
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (!cancelled) redraw();
      };
      // A picture that can't be read stays out rather than blocking the pad.
      image.onerror = () => {
        backgroundsRef.current = backgroundsRef.current.filter((item) => item !== entry);
        if (!cancelled) redraw();
      };
      image.src = url;
      if (!url.includes(";manual") && parseSnipBand(url)) {
        // Match the question box: cut lines nudged onto blank paper.
        void snapBandToWhitespace(url, band).then((tidy) => {
          if (cancelled) return;
          entry.top = tidy.top;
          entry.bottom = tidy.bottom;
          redraw();
        });
      }
      return entry;
    });
    backgroundsRef.current = loaded;
    redraw();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, backgroundUrls.join("|")]);


  // A trackpad pinch or Ctrl/⌘ + wheel must not zoom the pad or the page:
  // the picture is resized with the picture buttons only.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [full]);

  // Full screen freezes the page behind it and puts the student back on the
  // same question when they close it, instead of somewhere further down.
  useEffect(() => {
    if (!full) return;
    const y = window.scrollY;
    const body = document.body.style;
    const saved = { overflow: body.overflow };
    body.overflow = "hidden";
    return () => {
      body.overflow = saved.overflow;
      window.scrollTo({ top: y, behavior: "auto" });
      window.setTimeout(() => window.scrollTo({ top: y, behavior: "auto" }), 0);
    };
  }, [full]);

  // Never leave a pending save behind when the pad closes.
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  function positionOf(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = positionOf(event);
    const rect = pictureRect();
    const corner = hitHandleCorner(point);

    // The picture is only picked up, dragged or resized with the Move picture
    // tool (or the middle mouse button). In Write mode every touch draws.
    const moveTool = modeRef.current === "move" || event.button === 1;

    // A corner grab square on the highlighted picture makes it bigger/smaller.
    if (rect && corner && moveTool) {
      resizing.current = {
        startX: point.x,
        startY: point.y,
        startWidth: rect.width,
        startHeight: rect.height,
        startScale: photoScaleRef.current,
        corner,
      };
      resizeOrigin.current = { x: rect.x, y: rect.y };
      return;
    }

    if (moveTool) {
      // Tapping the picture highlights it; a drag then moves it.
      if (hitPicture(point)) {
        if (!selectedRef.current) {
          selectedRef.current = true;
          setSelected(true);
        }
        panning.current = { x: event.clientX, y: event.clientY };
        redraw();
        return;
      }
      // Blank paper with the Move tool: put the picture down and pan it.
      if (selectedRef.current) {
        selectedRef.current = false;
        setSelected(false);
      }
      panning.current = { x: event.clientX, y: event.clientY };
      redraw();
      return;
    }

    // Write mode: drop any highlight and start inking.
    if (selectedRef.current) {
      selectedRef.current = false;
      setSelected(false);
      redraw();
    }
    drawing.current = true;
    const width = event.pointerType === "pen" ? Math.max(1.2, event.pressure * 4 || 2) : 2.4;
    strokesRef.current.push({ points: [point], width, color: colorRef.current });
    setHasInk(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (resizing.current) {
      event.preventDefault();
      const grab = resizing.current;
      const point = positionOf(event);
      // Dragging outwards from the corner grows the picture, inwards shrinks it,
      // whichever corner is held.
      const signX = grab.corner === "ne" || grab.corner === "se" ? 1 : -1;
      const signY = grab.corner === "sw" || grab.corner === "se" ? 1 : -1;
      const byWidth = (grab.startWidth + signX * (point.x - grab.startX)) / Math.max(1, grab.startWidth);
      const byHeight =
        (grab.startHeight + signY * (point.y - grab.startY)) / Math.max(1, grab.startHeight);
      const factor = Math.max(0.05, (byWidth + byHeight) / 2);
      const next = Math.max(0.15, Math.min(2.5, grab.startScale * factor));
      const applied = next / grab.startScale;
      photoScaleRef.current = next;
      // Keep the corner opposite the one being dragged exactly where it is.
      offsetRef.current = {
        x:
          signX === 1
            ? resizeOrigin.current.x
            : resizeOrigin.current.x + grab.startWidth - grab.startWidth * applied,
        y:
          signY === 1
            ? resizeOrigin.current.y
            : resizeOrigin.current.y + grab.startHeight - grab.startHeight * applied,
      };
      setPhotoScale(Number(next.toFixed(2)));
      redraw();
      return;
    }
    if (panning.current) {
      event.preventDefault();
      offsetRef.current = {
        x: offsetRef.current.x + (event.clientX - panning.current.x),
        y: offsetRef.current.y + (event.clientY - panning.current.y),
      };
      panning.current = { x: event.clientX, y: event.clientY };
      redraw();
      return;
    }
    if (!drawing.current) {
      setHoverCorner(hitHandleCorner(positionOf(event)));
      return;
    }
    event.preventDefault();
    strokesRef.current[strokesRef.current.length - 1]?.points.push(positionOf(event));
    redraw();
  }

  function end() {
    if (drawing.current) {
      setSaved(false);
      scheduleSave();
    }
    drawing.current = false;
    panning.current = null;
    resizing.current = null;
    setHoverCorner(null);
    updateSheet();
  }


  /** Saves the current sheet as the answer picture, keeping the ink on the pad
   * so the student can carry on from their last working after a wrong answer. */
  function attach() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The blue outline is a screen guide only — never part of the saved sheet.
    const wasSelected = selectedRef.current;
    selectedRef.current = false;
    redraw();
    // A small picture of the sheet, so the student can see it is attached.
    try {
      setThumbnail(canvas.toDataURL("image/png"));
    } catch {
      /* ignore: the preview is a nicety, never a blocker */
    }
    canvas.toBlob((blob) => {
      if (blob) {
        onAttach(new File([blob], PAD_FILE_NAME, { type: "image/png" }));
        setSaved(true);
      }
      selectedRef.current = wasSelected;
      redraw();
    }, "image/png");

  }



  /** Keeps the saved picture in step with the pad without the student thinking
   * about it, so pressing Check answer always marks their latest working. */
  function scheduleSave() {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (strokesRef.current.length > 0) attach();
    }, 700);
  }

  /** Minimising saves the sheet so the student can go straight to submitting. */
  function minimise() {
    if (hasInk) attach();
    setFull(false);
  }

  // Away from full screen the pad is just an entry point — the confusing small
  // sketch area is gone, so writing always happens on the big sheet.
  if (!full) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <PenLine className="size-4" />
            Write your working here
          </p>
          <Button type="button" size="sm" disabled={disabled} onClick={() => setFull(true)}>
            <Expand className="size-4" />
            Open the writing pad
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasInk
            ? "Your working is saved. Open the pad again to carry on from where you left off."
            : "Opens full screen with the question printed underneath, so you can write straight over it with a stylus, finger or mouse."}
        </p>
        {thumbnail ? (
          <div className="mt-2 flex items-center gap-3">
            <img
              src={thumbnail}
              alt="Your saved working"
              draggable={false}
              onContextMenu={(event) => event.preventDefault()}
              onDragStart={(event) => event.preventDefault()}
              className="pointer-events-none h-24 w-auto max-w-[9rem] select-none rounded border border-border bg-white object-contain object-top"
            />
            <p className="text-xs text-muted-foreground">
              This is attached to your answer. Open the writing pad to change it.
            </p>
          </div>
        ) : null}
      </div>

    );
  }

  return (
    <div
      className={
        "fixed inset-0 z-50 flex select-none flex-col overflow-hidden bg-background p-3 [-webkit-touch-callout:none] [-webkit-user-select:none]"
      }
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <PenLine className="size-4" />
          Write your working here
        </p>
        <Button type="button" size="sm" variant="outline" onClick={minimise}>
          <Minimize className="size-4" />
          Minimise &amp; save
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {"The question is printed underneath. In Write mode every touch draws, even over the picture. Switch to Move picture to tap the picture, drag it anywhere, or pull a blue corner square to make it bigger or smaller — then switch back to Write. Scroll down for as much space as you need. Minimise & save keeps your sheet, then press Check answer."}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {PEN_COLORS.map((pen) => (
          <button
            key={pen.value}
            type="button"
            title={pen.name}
            aria-label={pen.name}
            aria-pressed={color === pen.value}
            disabled={disabled}
            onClick={() => setColor(pen.value)}
            className={`size-6 rounded-full border-2 transition-transform ${
              color === pen.value ? "scale-110 border-foreground" : "border-border"
            }`}
            style={{ backgroundColor: pen.value }}
          />
        ))}
        <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />

            <div className="inline-flex items-center rounded-lg border border-border p-1">
              <Button
                type="button"
                size="sm"
                variant={mode === "draw" ? "default" : "ghost"}
                disabled={disabled}
                onClick={() => setMode("draw")}
                className="rounded-md"
              >
                <PenLine className="size-4" />
                Write
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "move" ? "default" : "ghost"}
                disabled={disabled}
                onClick={() => setMode("move")}
                className="rounded-md"
              >
                <Hand className="size-4" />
                Move picture
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || photoScale <= 0.4}
              aria-label="Make the question picture smaller"
              onClick={() => {
                setPhotoScale((s) => Math.max(0.4, Number((s - 0.1).toFixed(2))));
                requestAnimationFrame(() => {
                  redraw();
                  updateSheet();
                });
              }}
            >
              <ImageMinus className="size-4" />
            </Button>
            <span className="w-12 text-center text-xs text-muted-foreground">
              {Math.round(photoScale * 100)}%
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || photoScale >= 2.5}
              aria-label="Make the question picture bigger"
              onClick={() => {
                setPhotoScale((s) => Math.min(2.5, Number((s + 0.1).toFixed(2))));
                requestAnimationFrame(() => {
                  redraw();
                  updateSheet();
                });
              }}
            >
              <ImagePlus className="size-4" />
            </Button>
          </>
      </div>
      <div
          ref={scrollRef}
          onScroll={updateSheet}
          className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerCancel={end}
            style={{ height: sheetHeight ? `${sheetHeight}px` : "150vh" }}
            className={`w-full touch-none rounded-md border border-border bg-white ${
              hoverCorner
                ? {
                    nw: "cursor-nwse-resize",
                    se: "cursor-nwse-resize",
                    ne: "cursor-nesw-resize",
                    sw: "cursor-nesw-resize",
                  }[hoverCorner]
                : selected || mode === "move"
                  ? "cursor-grab"
                  : "cursor-crosshair"
            }`}
          />
      </div>



      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={attach} disabled={disabled || !hasInk}>
          Save my working
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !hasInk}
          onClick={() => {
            strokesRef.current.pop();
            setHasInk(strokesRef.current.length > 0);
            setSaved(false);
            redraw();
            scheduleSave();
          }}
        >
          <Undo2 className="size-4" />
          Undo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || !hasInk}
          onClick={() => {
            strokesRef.current = [];
            setHasInk(false);
            setSaved(false);
            redraw();
          }}
        >
          <Eraser className="size-4" />
          Clear
        </Button>
        {hasInk ? (
          <span className="self-center text-xs text-muted-foreground">
            {saved
              ? "Your working is saved on the pad — press Check answer when ready."
              : "Saving your working…"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
