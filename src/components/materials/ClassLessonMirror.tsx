import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { listClassPresenters } from "@/lib/mirror.functions";

type MirrorAnnouncement = {
  from?: string;
  sessionId?: string;
  viewActive?: boolean;
  finalView?: boolean;
  view?: Record<string, unknown>;
};

const returnKey = (classId: string) => `lesson-mirror-return:${classId}`;
const restoreKey = (classId: string) => `lesson-mirror-restore:${classId}`;
const sessionKey = (classId: string) => `lesson-mirror-session:${classId}`;

/** Listens for a shared lesson from every page inside a student's class. */
export function ClassLessonMirror({ classId, isStudent }: { classId: string; isStudent: boolean }) {
  const fetchPresenters = useServerFn(listClassPresenters);
  const presenters = useQuery({
    queryKey: ["class-presenters", classId],
    queryFn: () => fetchPresenters({ data: { classId } }),
    enabled: isStudent,
    staleTime: 10 * 60 * 1000,
  });
  const trusted = useRef<string[]>([]);
  trusted.current = presenters.data?.presenterIds ?? [];

  useEffect(() => {
    if (!isStudent) return;
    const saved = window.sessionStorage.getItem(restoreKey(classId));
    if (!saved) return;
    window.sessionStorage.removeItem(restoreKey(classId));
    try {
      const position = JSON.parse(saved) as { x: number; y: number };
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => window.scrollTo(position.x, position.y)),
      );
    } catch {
      // A damaged restoration record should not prevent class navigation.
    }
  }, [classId, isStudent]);

  useEffect(() => {
    if (!isStudent || trusted.current.length === 0) return;
    let channel: RealtimeChannel | null = null;
    let timer: number | null = null;
    let cancelled = false;

    const receive = ({ payload }: { payload: unknown }) => {
      const message = payload as MirrorAnnouncement;
      if (!message.from || !trusted.current.includes(message.from)) return;

      if (message.viewActive === true) {
        const unitId = message.view?.["workspace.unitId"];
        if (typeof unitId !== "string") return;
        if (message.sessionId) {
          window.sessionStorage.setItem(sessionKey(classId), message.sessionId);
        }
        const target = `/classes/${classId}/materials?mirrorUnit=${encodeURIComponent(unitId)}`;
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (!window.sessionStorage.getItem(returnKey(classId))) {
          window.sessionStorage.setItem(
            returnKey(classId),
            JSON.stringify({ href: current, x: window.scrollX, y: window.scrollY }),
          );
        }
        if (current !== target) window.location.assign(target);
        return;
      }

      // Only an intentional Stop mirroring message should navigate a student
      // back. A bare inactive heartbeat can arrive late after reconnecting and
      // used to kick the whole class out of the lesson workspace.
      if (message.finalView === true) {
        const activeSession = window.sessionStorage.getItem(sessionKey(classId));
        if (message.sessionId && activeSession && message.sessionId !== activeSession) return;
        const saved = window.sessionStorage.getItem(returnKey(classId));
        if (!saved) return;
        window.sessionStorage.removeItem(returnKey(classId));
        window.sessionStorage.removeItem(sessionKey(classId));
        try {
          const previous = JSON.parse(saved) as { href: string; x: number; y: number };
          window.sessionStorage.setItem(
            restoreKey(classId),
            JSON.stringify({ x: previous.x, y: previous.y }),
          );
          window.location.assign(previous.href);
        } catch {
          window.location.assign(`/classes/${classId}`);
        }
      }
    };

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase.channel(`lesson-mirror:${classId}`, {
        config: { broadcast: { self: false } },
      });
      channel.on("broadcast", { event: "lesson" }, receive);
      channel.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (timer) window.clearInterval(timer);
        const hello = () => void channel?.send({ type: "broadcast", event: "hello", payload: {} });
        hello();
        timer = window.setInterval(hello, 1500);
      });
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [classId, isStudent, presenters.dataUpdatedAt]);

  return null;
}
