import {
  Eraser,
  Expand,
  Hand,
  ImageMinus,
  ImagePlus,
  Maximize,
  Minimize,
  PenLine,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const MAX_SHEET = 12000;


/**
 * Stylus / finger / mouse writing pad for working out calculations on screen
 * (e.g. an iPad with an Apple Pencil). The finished sheet is attached as an
 * image file exactly like an uploaded photo, so marking is unchanged.
 * Supports zooming in for fine detail (buttons, trackpad pinch, or Ctrl/⌘ +
 * scroll wheel); strokes are stored in pad coordinates so zooming never
 * distorts the work.
 * When `backgroundUrls` are given, the pad can be opened full screen with the
 * question picture printed underneath so the student writes straight onto it.
 */
export function DrawingPad({
  disabled = false,
  height = "h-[28rem]",
  backgroundUrls = [],
  onAttach,
}: {
  disabled?: boolean;
  /** Tailwind height class for the pad surface. */
  height?: string;
  /** Question picture(s) shown faintly under the ink in full screen. */
  backgroundUrls?: string[];
  onAttach: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawing = useRef(false);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const dprRef = useRef(1);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [hasInk, setHasInk] = useState(false);
  const [full, setFull] = useState(false);
  const [mode, setMode] = useState<"draw" | "move">("draw");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // The sheet is as long as the student needs: it stretches while they scroll
  // down and shrinks back to the work when they come back up.
  const [sheetHeight, setSheetHeight] = useState(0);
  const backgroundsRef = useRef<HTMLImageElement[]>([]);
  const [photoScale, setPhotoScale] = useState(1);
  const photoScaleRef = useRef(photoScale);
  photoScaleRef.current = photoScale;
  const [color, setColor] = useState(PEN_COLORS[0]!.value);
  const colorRef = useRef(color);
  colorRef.current = color;


  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.translate(offsetRef.current.x, offsetRef.current.y);
    ctx.scale(zoomRef.current, zoomRef.current);
    // The question picture sits under the ink so the work is marked in context.
    const padWidth = (canvas.width / dpr) * photoScaleRef.current;
    let y = 0;
    for (const image of backgroundsRef.current) {
      if (!image.complete || !image.naturalWidth) continue;
      const h = (padWidth * image.naturalHeight) / image.naturalWidth;
      ctx.drawImage(image, 0, y, padWidth, h);
      y += h + 8;
    }

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
  }

  /** Zoom keeping the given screen point (relative to the canvas) stationary. */
  function zoomTo(next: number, px: number, py: number) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const k = clamped / zoomRef.current;
    offsetRef.current = {
      x: px - (px - offsetRef.current.x) * k,
      y: py - (py - offsetRef.current.y) * k,
    };
    zoomRef.current = clamped;
    setZoom(clamped);
    redraw();
  }

  function zoomFromButton(factor: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    zoomTo(zoomRef.current * factor, rect.width / 2, rect.height / 2);
  }

  function resetZoom() {
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setZoom(1);
    redraw();
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
  }, [full]);

  // Load the question picture(s) for the full-screen pad.
  useEffect(() => {
    if (!full || backgroundUrls.length === 0) {
      backgroundsRef.current = [];
      redraw();
      return;
    }
    let cancelled = false;
    const images = backgroundUrls.slice(0, 3).map((url) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (!cancelled) redraw();
      };
      // A picture that can't be read stays out rather than blocking the pad.
      image.onerror = () => {
        backgroundsRef.current = backgroundsRef.current.filter((item) => item !== image);
        if (!cancelled) redraw();
      };
      image.src = url;
      return image;
    });
    backgroundsRef.current = images;
    redraw();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, backgroundUrls.join("|")]);


  // Ctrl/⌘ + wheel or trackpad pinch zooms the pad, anchored at the cursor.
  // React's onWheel is passive, so this needs a native non-passive listener.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const dy =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const rect = canvas.getBoundingClientRect();
      zoomTo(
        zoomRef.current * Math.exp(-dy * 0.002),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  function positionOf(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - offsetRef.current.x) / zoomRef.current,
      y: (event.clientY - rect.top - offsetRef.current.y) / zoomRef.current,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const width = event.pointerType === "pen" ? Math.max(1.2, event.pressure * 4 || 2) : 2.4;
    strokesRef.current.push({ points: [positionOf(event)], width, color: colorRef.current });
    setHasInk(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    event.preventDefault();
    strokesRef.current[strokesRef.current.length - 1]?.points.push(positionOf(event));
    redraw();
  }

  function end() {
    drawing.current = false;
  }

  function attach() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Export the whole sheet at 100% zoom, whatever the student is viewing at.
    const savedZoom = zoomRef.current;
    const savedOffset = { ...offsetRef.current };
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    redraw();
    canvas.toBlob((blob) => {
      zoomRef.current = savedZoom;
      offsetRef.current = savedOffset;
      redraw();
      if (!blob) return;
      onAttach(new File([blob], `working-${Date.now()}.png`, { type: "image/png" }));
      strokesRef.current = [];
      setHasInk(false);
      redraw();
    }, "image/png");
  }

  /** Minimising saves the sheet so the student can go straight to submitting. */
  function minimise() {
    if (hasInk) attach();
    setFull(false);
  }

  return (
    <div
      className={
        full
          ? "fixed inset-0 z-50 flex select-none flex-col overflow-auto bg-background p-3 [-webkit-touch-callout:none] [-webkit-user-select:none]"
          : "rounded-lg border border-dashed border-border p-3"
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
        {full ? (
          <Button type="button" size="sm" variant="outline" onClick={minimise}>
            <Minimize className="size-4" />
            Minimise &amp; save
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setFull(true)}>
            <Expand className="size-4" />
            Full screen
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {full
          ? "The question is printed underneath — write straight over it. Minimise & save keeps your sheet, then press Check answer."
          : "Use a stylus, finger or mouse. Open full screen to draw on top of the question picture."}
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
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || zoom <= MIN_ZOOM}
          onClick={() => zoomFromButton(1 / 1.25)}
          aria-label="Zoom out"
        >
          <ZoomOut className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || zoom >= MAX_ZOOM}
          onClick={() => zoomFromButton(1.25)}
          aria-label="Zoom in"
        >
          <ZoomIn className="size-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || zoom === 1}
          onClick={resetZoom}
        >
          <Maximize className="size-4" />
          Reset
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        className={`mt-2 w-full touch-none rounded-md border border-border bg-white ${
          full ? "min-h-0 flex-1" : height
        }`}
      />


      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={attach} disabled={disabled || !hasInk}>
          Attach this working
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !hasInk}
          onClick={() => {
            strokesRef.current.pop();
            setHasInk(strokesRef.current.length > 0);
            redraw();
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
            redraw();
          }}
        >
          <Eraser className="size-4" />
          Clear
        </Button>
      </div>
    </div>
  );
}
