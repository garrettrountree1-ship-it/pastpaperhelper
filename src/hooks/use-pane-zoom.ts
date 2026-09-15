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
  const pendingFrames = useRef<number[]>([]);

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
    const moveToAnchor = () => {
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollLeft = Math.min(maxLeft, Math.max(0, target.x));
      el.scrollTop = Math.min(maxTop, Math.max(0, target.y));
    };
    // Pages, slides and annotation layers resize over the next few frames.
    // Re-apply the anchor until the scrollable width has caught up, otherwise
    // the first move is clamped against the old width and the view stays pinned
    // to the left edge.
    moveToAnchor();
    let frames = 0;
    const step = () => {
      moveToAnchor();
      frames += 1;
      if (frames < 6) pendingFrames.current.push(requestAnimationFrame(step));
    };
    pendingFrames.current.push(requestAnimationFrame(step));
    return () => {
      pendingFrames.current.forEach((id) => cancelAnimationFrame(id));
      pendingFrames.current = [];
    };
  }, [scrollRef, zoom]);

  useEffect(() => {
    if (!enabled) return;

    // The pane is looked up when a gesture happens, not when this runs: viewers
    // show a loading state first, so the scrolling element usually does not
    // exist yet at mount and listeners bound to it then would never fire.
    const paneOf = (target: EventTarget | null): HTMLDivElement | null => {
      const el = scrollRef.current;
      if (!el) return null;
      if (!(target instanceof Node)) return null;
      return el === target || el.contains(target) ? el : null;
    };

    let pinch: {
      el: HTMLDivElement;
      distance: number;
      zoom: number;
      center: Point;
      scrollLeft: number;
      scrollTop: number;
    } | null = null;

    const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
    const center = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const localTouches = (event: TouchEvent, el: HTMLElement): Point[] => {
      const rect = el.getBoundingClientRect();
      return Array.from(event.touches)
        .slice(0, 2)
        .map((touch) => ({ x: touch.clientX - rect.left, y: touch.clientY - rect.top }));
    };

    const beginPinch = (el: HTMLDivElement, a: Point, b: Point) => {
      pinch = {
        el,
        distance: Math.max(1, distance(a, b)),
        zoom: zoomRef.current,
        center: center(a, b),
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
      el.style.touchAction = "none";
    };

    const zoomTo = (nextRaw: number, currentCenter: Point) => {
      if (!pinch) return;
      const nextZoom = Math.min(max, Math.max(min, Number(nextRaw.toFixed(3))));
      const k = nextZoom / pinch.zoom;
      pendingScroll.current = {
        x: (pinch.scrollLeft + pinch.center.x) * k - currentCenter.x,
        y: (pinch.scrollTop + pinch.center.y) * k - currentCenter.y,
      };
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
    };

    // Native touch events are used instead of pointer events: only a
    // cancelable touchmove can stop the browser from pinch-zooming the whole
    // window, so the gesture stays inside this pane. They are listened for on
    // the document during the capture phase so that drawing layers, text layers
    // and other children can never swallow the gesture first.
    const onTouchStart = (event: TouchEvent) => {
      // One finger is left entirely to the browser (native scrolling) or to
      // whichever drawing tool is under it.
      if (event.touches.length < 2) {
        pinch = null;
        return;
      }
      const el = paneOf(event.target);
      if (!el) return;
      const [a, b] = localTouches(event, el);
      if (!a || !b) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      beginPinch(el, a, b);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      const el = pinch?.el ?? paneOf(event.target);
      if (!el) return;
      const [a, b] = localTouches(event, el);
      if (!a || !b) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      if (!pinch) {
        beginPinch(el, a, b);
        return;
      }
      zoomTo(pinch.zoom * (distance(a, b) / pinch.distance), center(a, b));
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      if (pinch) pinch.el.style.touchAction = "pan-x pan-y";
      pinch = null;
    };

    // Safari reports trackpad and touch pinch as gesture events, which ignore
    // touch-action; without these the page itself zooms.
    let gesture: {
      el: HTMLDivElement;
      zoom: number;
      center: Point;
      scrollLeft: number;
      scrollTop: number;
    } | null = null;
    const gesturePoint = (event: Event, el: HTMLElement): Point => {
      const rect = el.getBoundingClientRect();
      const source = event as Event & { clientX?: number; clientY?: number };
      return {
        x: (source.clientX ?? rect.left + rect.width / 2) - rect.left,
        y: (source.clientY ?? rect.top + rect.height / 2) - rect.top,
      };
    };
    const onGestureStart = (event: Event) => {
      const el = paneOf(event.target);
      if (!el) return;
      event.preventDefault();
      gesture = {
        el,
        zoom: zoomRef.current,
        center: gesturePoint(event, el),
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
    };
    const onGestureChange = (event: Event) => {
      if (!gesture) return;
      event.preventDefault();
      const scale = (event as Event & { scale?: number }).scale ?? 1;
      pinch = { ...gesture, distance: 1 };
      zoomTo(gesture.zoom * scale, gesturePoint(event, gesture.el));
    };
    const onGestureEnd = (event: Event) => {
      if (!gesture) return;
      event.preventDefault();
      gesture = null;
      pinch = null;
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const el = paneOf(event.target);
      if (!el) return;
      event.preventDefault();
      const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const rect = el.getBoundingClientRect();
      applyZoom((value) => value * Math.exp(-dy * 0.0015), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    // The browser keeps one-finger scrolling (and scroll chaining out to the
    // page); only whole-page pinch zoom is blocked, since we handle pinch here.
    const paneTouchAction = () => {
      const el = scrollRef.current;
      if (el && !el.style.touchAction) el.style.touchAction = "pan-x pan-y";
    };
    paneTouchAction();
    const touchActionTimer = window.setInterval(paneTouchAction, 1000);

    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    document.addEventListener("touchstart", onTouchStart, { passive: false, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    document.addEventListener("touchend", onTouchEnd, true);
    document.addEventListener("touchcancel", onTouchEnd, true);
    document.addEventListener("gesturestart", onGestureStart as EventListener, {
      passive: false,
      capture: true,
    });
    document.addEventListener("gesturechange", onGestureChange as EventListener, {
      passive: false,
      capture: true,
    });
    document.addEventListener("gestureend", onGestureEnd as EventListener, {
      passive: false,
      capture: true,
    });
    return () => {
      window.clearInterval(touchActionTimer);
      document.removeEventListener("wheel", onWheel, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      document.removeEventListener("gesturestart", onGestureStart as EventListener, true);
      document.removeEventListener("gesturechange", onGestureChange as EventListener, true);
      document.removeEventListener("gestureend", onGestureEnd as EventListener, true);
    };
  }, [applyZoom, enabled, max, min, scrollRef, setZoom]);

  return { applyZoom };
}
