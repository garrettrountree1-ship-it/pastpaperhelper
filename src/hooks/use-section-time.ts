import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";

import { recordActivity } from "@/lib/admin.functions";

/**
 * Records how long the user spends in a section so the platform owner can see
 * where time goes. Flushes every 60s and when leaving the section.
 */
export function useSectionTime(section: string) {
  const record = useServerFn(recordActivity);
  const startedRef = useRef<number>(Date.now());

  useEffect(() => {
    startedRef.current = Date.now();
    let cancelled = false;

    const flush = () => {
      const seconds = Math.round((Date.now() - startedRef.current) / 1000);
      startedRef.current = Date.now();
      if (seconds < 5 || cancelled) return;
      void record({ data: { section, seconds } }).catch(() => {});
    };

    const timer = window.setInterval(flush, 60_000);
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      flush();
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [record, section]);
}
