import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useDemoView } from "@/lib/demo-view";

/**
 * Drawings and text boxes made on a document belong to the person who made
 * them, so every markup store is namespaced by the signed-in account (and by
 * the demo teacher/student view, which shares one login). Rendered document
 * caches stay shared — only the personal markup is scoped.
 */
export function useMarkupScope() {
  const [userId, setUserId] = useState<string | null>(null);
  const { view } = useDemoView(true, "teacher");


  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? "anon");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready: userId !== null, scope: `${userId ?? "anon"}:${demoView ?? "self"}` };
}

/** Suffix a markup storage key with the personal scope. */
export function scopedKey(key: string, scope: string) {
  return `${key}::${scope}`;
}
