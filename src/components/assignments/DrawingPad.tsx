import { Eraser, PenLine, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type Stroke = { points: Array<{ x: number; y: number }>; width: number };

/**
 * Stylus / finger / mouse writing pad for working out calculations on screen
 * (e.g. an iPad with an Apple Pencil). The finished sheet is attached as an
 * image file exactly like an uploaded photo, so marking is unchanged.
 */
export function DrawingPad({
  disabled = false,
  onAttach,
}: {
  disabled?: boolean;
  onAttach: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#111827";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      ctx.lineWidth = stroke.width;
      ctx.beginPath();
      stroke.points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }
  }

  // Size the bitmap to the element so strokes land under the pen tip.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function positionOf(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const width = event.pointerType === "pen" ? Math.max(1.2, event.pressure * 4 || 2) : 2.4;
    strokesRef.current.push({ points: [positionOf(event)], width });
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
    canvas.toBlob((blob) => {
      if (!blob) return;
      onAttach(new File([blob], `working-${Date.now()}.png`, { type: "image/png" }));
      strokesRef.current = [];
      setHasInk(false);
      redraw();
    }, "image/png");
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <PenLine className="size-4" />
        Write your working here
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Use a stylus, finger or mouse. When you&apos;re done, attach it — it&apos;s marked step by
        step like a photo of paper.
      </p>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        className="mt-2 h-64 w-full touch-none rounded-md border border-border bg-white"
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
