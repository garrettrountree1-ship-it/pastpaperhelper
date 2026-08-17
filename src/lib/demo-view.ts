import { useCallback, useEffect, useState } from "react";

export type ViewRole = "teacher" | "student";

const KEY = "demoViewRole";
const EVENT = "demo-view-role-change";

export function readDemoView(): ViewRole | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "teacher" || value === "student" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Demo-only view override. Real accounts never call this — their role comes
 * from the database and cannot be switched.
 */
export function useDemoView(enabled: boolean, fallback: ViewRole) {
  const [view, setView] = useState<ViewRole | null>(null);

  useEffect(() => {
    if (!enabled) return;
    setView(readDemoView() ?? fallback);
    const onChange = () => setView(readDemoView() ?? fallback);
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [enabled, fallback]);

  const setDemoView = useCallback((next: ViewRole) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // ignore storage errors
    }
    setView(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { view: enabled ? (view ?? fallback) : fallback, setDemoView };
}
