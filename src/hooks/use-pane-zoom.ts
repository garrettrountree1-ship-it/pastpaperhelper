import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

type Point = { x: number; y: number };

/**
 * Keeps zoom anchored under the pointer and adds touch panning/two-finger pinch
 * without letting the browser zoom the whole page. Touch is reserved for moving
 * the view; a mouse or stylus remains available for document and canvas tools.
 */
export function usePaneZoom({
  scrollRef,
  zoom,
  setZoom,
  min = 0.5,
  max = 3,
  enabled = true,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
  min?: number;
  max?: number;
  enabled?: boolean;
}) {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pendingScroll = useRef<Point | null>(null);

  const applyZoom = useCallback(
    (nextOf: (current: number) => number, anchor?: Point) => {
      const current = zoomRef.current;
      const next = Math.min(max, Math.max(min, Number(nextOf(current).toFixed(3))));
      const el = scrollRef.current;
      if (!el || next === current) return;
      const ax = anchor?.x ?? el.clientWidth / 2;
      const ay = anchor?.y ?? el.clientHeight / 2;
      const k = next / current;
      pendingScroll.current = {
        x: (el.scrollLeft + ax) * k - ax,
        y: (el.scrollTop + ay) * k - ay,
      };
      zoomRef.current = next;
      setZoom(next);
    },
    [max, min, scrollRef, setZoom],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const target = pendingScroll.current;
    pendingScroll.current = null;
    if (!el || !target) return;
    el.scrollLeft = Math.max(0, target.x);
    el.scrollTop = Math.max(0, target.y);
  }, [scrollRef, zoom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    const touches = new Map<number, Point>();
    let lastSingle: Point | null = null;
    let pinch: {
      distance: number;
      zoom: number;
      center: Point;
      scrollLeft: number;
      scrollTop: number;
    } | null = null;

    const localPoint = (event: PointerEvent): Point => {
      const rect = el.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const pair = () => Array.from(touches.values()).slice(0, 2);
    const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
    const center = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    const beginPinch = () => {
      const [a, b] = pair();
      if (!a || !b) return;
      pinch = {
        distance: Math.max(1, distance(a, b)),
        zoom: zoomRef.current,
        center: center(a, b),
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
      lastSingle = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      touches.set(event.pointerId, localPoint(event));
      el.setPointerCapture?.(event.pointerId);
      if (touches.size >= 2) beginPinch();
      else lastSingle = localPoint(event);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !touches.has(event.pointerId)) return;
      const nextPoint = localPoint(event);
      touches.set(event.pointerId, nextPoint);
      event.preventDefault();
      event.stopPropagation();

      if (touches.size >= 2) {
        if (!pinch) beginPinch();
        const [a, b] = pair();
        if (!pinch || !a || !b) return;
        const currentCenter = center(a, b);
        const nextZoom = Math.min(
          max,
          Math.max(min, Number((pinch.zoom * (distance(a, b) / pinch.distance)).toFixed(3))),
        );
        const k = nextZoom / pinch.zoom;
        pendingScroll.current = {
          x: (pinch.scrollLeft + pinch.center.x) * k - currentCenter.x,
          y: (pinch.scrollTop + pinch.center.y) * k - currentCenter.y,
        };
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        return;
      }

      if (lastSingle) {
        el.scrollLeft -= nextPoint.x - lastSingle.x;
        el.scrollTop -= nextPoint.y - lastSingle.y;
      }
      lastSingle = nextPoint;
    };

    const endPointer = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      touches.delete(event.pointerId);
      pinch = null;
      const remaining = pair()[0];
      lastSingle = remaining ?? null;
    };

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

    const previousTouchAction = el.style.touchAction;
    el.style.touchAction = "none";
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown, true);
    el.addEventListener("pointermove", onPointerMove, true);
    el.addEventListener("pointerup", endPointer, true);
    el.addEventListener("pointercancel", endPointer, true);
    return () => {
      el.style.touchAction = previousTouchAction;
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown, true);
      el.removeEventListener("pointermove", onPointerMove, true);
      el.removeEventListener("pointerup", endPointer, true);
      el.removeEventListener("pointercancel", endPointer, true);
    };
  }, [applyZoom, enabled, max, min, scrollRef, setZoom]);

  return { applyZoom };
}
