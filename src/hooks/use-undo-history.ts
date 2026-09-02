import { useCallback, useEffect, useRef } from "react";

/**
 * Tracks changes to a controlled value so Ctrl/⌘ + Z (undo) and
 * Ctrl/⌘ + Shift + Z / Ctrl + Y (redo) can step through edit history.
 */
export function useUndoHistory<T>(value: T, onChange: (next: T) => void, limit = 200) {
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const last = useRef<T>(value);
  const internal = useRef(false);

  useEffect(() => {
    if (value === last.current) return;
    if (internal.current) {
      internal.current = false;
      last.current = value;
      return;
    }
    past.current = [...past.current, last.current].slice(-limit);
    future.current = [];
    last.current = value;
  }, [value, limit]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return false;
    future.current = [last.current, ...future.current];
    internal.current = true;
    last.current = prev;
    onChange(prev);
    return true;
  }, [onChange]);

  const redo = useCallback(() => {
    const next = future.current.shift();
    if (next === undefined) return false;
    past.current = [...past.current, last.current];
    internal.current = true;
    last.current = next;
    onChange(next);
    return true;
  }, [onChange]);

  return { undo, redo };
}
