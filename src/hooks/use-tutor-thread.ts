import { useCallback, useEffect, useRef, useState } from "react";

import { INITIAL_TUTOR_TURNS, type LessonTutorTurn } from "@/components/materials/LessonTutorBar";
import { supabase } from "@/integrations/supabase/client";
import { readDemoView } from "@/lib/demo-view";

/**
 * Keeps the AI tutor conversation private to the signed-in account. Each
 * user (and, on the shared demo login, each view role) gets its own thread,
 * stored per scope in this browser — conversations are never shared.
 */
export function useTutorThread(scope: string) {
  const [accountKey, setAccountKey] = useState<string | null>(null);
  const [turns, setTurns] = useState<LessonTutorTurn[]>(INITIAL_TUTOR_TURNS);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const id = data.user?.id ?? "anon";
      const view = readDemoView();
      setAccountKey(`tutorThread:${id}${view ? `:${view}` : ""}:${scope}`);
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  // Restore this account's own thread once we know whose it is.
  useEffect(() => {
    if (!accountKey || loadedFor.current === accountKey) return;
    loadedFor.current = accountKey;
    try {
      const raw = window.localStorage.getItem(accountKey);
      const parsed = raw ? (JSON.parse(raw) as LessonTutorTurn[]) : null;
      setTurns(Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_TUTOR_TURNS);
    } catch {
      setTurns(INITIAL_TUTOR_TURNS);
    }
  }, [accountKey]);

  const update = useCallback(
    (updater: (prev: LessonTutorTurn[]) => LessonTutorTurn[]) => {
      setTurns((prev) => {
        const next = updater(prev);
        if (accountKey) {
          try {
            window.localStorage.setItem(accountKey, JSON.stringify(next.slice(-40)));
          } catch {
            // storage full or unavailable — keep the in-memory thread
          }
        }
        return next;
      });
    },
    [accountKey],
  );

  const reset = useCallback(() => {
    if (accountKey) {
      try {
        window.localStorage.removeItem(accountKey);
      } catch {
        // ignore
      }
    }
    setTurns(INITIAL_TUTOR_TURNS);
  }, [accountKey]);

  return { turns, setTurns: update, reset };
}
