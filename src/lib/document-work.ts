import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef } from "react";

import { saveSectionDocumentWork } from "@/lib/notes.functions";

export type DocumentWork = Record<string, unknown>;

/** Debounced, serialized persistence for lesson-document edits. */
export function useDocumentWorkSaver({
  sectionId,
  materialId,
  enabled,
}: {
  sectionId?: string | undefined;
  materialId?: string | undefined;
  enabled: boolean;
}) {
  const save = useServerFn(saveSectionDocumentWork);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<DocumentWork | null>(null);
  const saving = useRef(false);

  const flush = useCallback(async () => {
    if (!enabled || !sectionId || !materialId || saving.current || !latest.current) return;
    const work = latest.current;
    latest.current = null;
    saving.current = true;
    try {
      await save({ data: { sectionId, materialId, work } });
    } catch {
      // Keep the newest unsaved snapshot and retry. IndexedDB remains the
      // immediate safety copy while a teacher is briefly offline.
      if (!latest.current) latest.current = work;
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush();
      }, 2_000);
    } finally {
      saving.current = false;
      if (latest.current && !timer.current) void flush();
    }
  }, [enabled, materialId, save, sectionId]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void flush();
    },
    [flush],
  );

  return useCallback(
    (work: DocumentWork) => {
      if (!enabled) return;
      latest.current = work;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush();
      }, 450);
    },
    [enabled, flush],
  );
}
