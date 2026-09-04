import { useEffect, useRef } from "react";

const IDLE_MS = 60_000;

/**
 * Counts only genuinely active seconds a student spends on one question.
 *
 * A second is counted when all of these are true:
 *  - the browser tab is visible and focused,
 *  - the question card is actually on screen,
 *  - the student moved the mouse, typed, tapped or scrolled in the last minute.
 *
 * Idle time (tab left open, student away) is not counted.
 */
export function useActiveTime(target: React.RefObject<HTMLElement | null>) {
  const secondsRef = useRef(0);
  const lastActivityRef = useRef(0);
  const visibleRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "wheel",
      "scroll",
      "touchstart",
      "touchmove",
      "pointerdown",
    ] as const;
    events.forEach((event) =>
      window.addEventListener(event, markActive, { passive: true }),
    );

    let observer: IntersectionObserver | undefined;
    const element = target.current;
    if (element && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          visibleRef.current = Boolean(entry?.isIntersecting);
        },
        { threshold: 0.2 },
      );
      observer.observe(element);
    } else {
      visibleRef.current = true;
    }

    const tick = window.setInterval(() => {
      const focused = document.visibilityState === "visible" && document.hasFocus();
      const active = Date.now() - lastActivityRef.current < IDLE_MS;
      if (focused && active && visibleRef.current) secondsRef.current += 1;
    }, 1000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, markActive));
      observer?.disconnect();
      window.clearInterval(tick);
    };
  }, [target]);

  return {
    /** Active seconds accumulated so far. */
    secondsRef,
    /** Call after submitting so the next attempt starts from zero. */
    reset: () => {
      secondsRef.current = 0;
    },
  };
}
