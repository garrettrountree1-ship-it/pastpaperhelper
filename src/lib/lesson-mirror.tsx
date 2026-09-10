import type { RealtimeChannel } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Live screen mirroring for present mode.
 *
 * While the teacher is presenting and has mirroring switched on, every part of
 * the lesson view they touch (which section, which document, the canvas work,
 * zoom, scrolling and marks made on the document) is broadcast to the students
 * who are also in present mode, so their screens follow the board live. Nothing
 * outside present mode is ever shared, and switching mirroring off hands
 * control straight back to each student.
 */

type Fields = Record<string, unknown>;

export type MirrorApi = {
  /** This screen is the source being mirrored out. */
  sending: boolean;
  /** This screen is following the teacher's board. */
  receiving: boolean;
  mirrorOn: boolean;
  setMirrorOn: (next: boolean) => void;
  /** Number of screens currently following (teacher side, best effort). */
  publish: (key: string, value: unknown) => void;
  received: Fields;
};

const idleApi: MirrorApi = {
  sending: false,
  receiving: false,
  mirrorOn: false,
  setMirrorOn: () => {},
  publish: () => {},
  received: {},
};

const MirrorContext = createContext<MirrorApi>(idleApi);

export const LessonMirrorContext = MirrorContext;

export function useLessonMirror() {
  return useContext(MirrorContext);
}

/** Builds the mirror connection. Used once, by the lesson workspace. */
export function useLessonMirrorState({
  classId,
  isTeacher,
  presenting,
  presenterIds,
}: {
  classId: string;
  isTeacher: boolean;
  presenting: boolean;
  /** Accounts a student will accept a mirrored screen from. */
  presenterIds: string[];
}): MirrorApi {
  const [mirrorOn, setMirrorOn] = useState(false);
  const [remoteActive, setRemoteActive] = useState(false);
  const [received, setReceived] = useState<Fields>({});
  const all = useRef<Fields>({});
  const pending = useRef<Fields>({});
  const selfId = useRef<string | null>(null);

  const topic = `lesson-mirror:${classId}`;
  const sending = isTeacher && presenting && mirrorOn;
  const receiving = !isTeacher && presenting && remoteActive;
  const allowed = presenterIds.join(",");

  // Leaving present mode always stops mirroring.
  useEffect(() => {
    if (!presenting) setMirrorOn(false);
  }, [presenting]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      selfId.current = data.user?.id ?? null;
    });
  }, []);

  const publish = useCallback((key: string, value: unknown) => {
    all.current[key] = value;
    pending.current[key] = value;
  }, []);

  // Teacher: push changes out on a short heartbeat, and answer late joiners
  // with the full picture so they catch up instantly.
  useEffect(() => {
    if (!sending) return;
    let channel: RealtimeChannel | null = supabase.channel(topic, {
      config: { broadcast: { self: false } },
    });
    const sendState = (fields: Fields) => {
      void channel?.send({
        type: "broadcast",
        event: "state",
        payload: { active: true, from: selfId.current, fields },
      });
    };
    channel.on("broadcast", { event: "hello" }, () => sendState(all.current));
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") sendState(all.current);
    });
    const timer = setInterval(() => {
      const patch = pending.current;
      if (Object.keys(patch).length === 0) return;
      pending.current = {};
      sendState(patch);
    }, 150);

    return () => {
      clearInterval(timer);
      void channel?.send({
        type: "broadcast",
        event: "state",
        payload: { active: false, from: selfId.current, fields: {} },
      });
      const closing = channel;
      channel = null;
      if (closing) void supabase.removeChannel(closing);
    };
  }, [sending, topic]);

  // Student: listen while presenting, and ask for the current picture on join.
  useEffect(() => {
    if (isTeacher || !presenting) return;
    const trusted = allowed ? allowed.split(",") : [];
    const channel = supabase.channel(topic, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "state" }, ({ payload }) => {
      const message = payload as { active?: boolean; from?: string; fields?: Fields };
      if (trusted.length > 0 && (!message.from || !trusted.includes(message.from))) return;
      if (!message.active) {
        setRemoteActive(false);
        setReceived({});
        return;
      }
      setRemoteActive(true);
      setReceived((current) => ({ ...current, ...(message.fields ?? {}) }));
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.send({ type: "broadcast", event: "hello", payload: {} });
      }
    });
    return () => {
      setRemoteActive(false);
      setReceived({});
      void supabase.removeChannel(channel);
    };
  }, [isTeacher, presenting, topic, allowed]);

  return { sending, receiving, mirrorOn, setMirrorOn, publish, received };
}

/** Keeps one piece of view state in step with the mirrored screen. */
export function useMirrorFieldWith<T>(
  api: MirrorApi,
  key: string,
  value: T,
  apply: (next: T) => void,
) {
  const { sending, receiving, publish, received } = api;
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (sending) publish(key, value);
  }, [sending, publish, key, value]);

  const incoming = received[key];
  useEffect(() => {
    if (!receiving || incoming === undefined) return;
    applyRef.current(incoming as T);
  }, [receiving, incoming]);
}

export function useMirrorField<T>(key: string, value: T, apply: (next: T) => void) {
  useMirrorFieldWith(useLessonMirror(), key, value, apply);
}

/**
 * Mirrors scrolling of a pane. Positions travel as a fraction of the scrollable
 * length, so a student on a smaller screen still follows the same place.
 */
export function useMirrorScroll(key: string, ref: React.RefObject<HTMLElement | null>) {
  const { sending, receiving, publish, received } = useLessonMirror();

  useEffect(() => {
    const el = ref.current;
    if (!el || !sending) return;
    let frame = 0;
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        publish(key, {
          top: el.scrollTop,
          left: el.scrollLeft,
          height: el.scrollHeight,
          width: el.scrollWidth,
        }),
      );
    };
    report();
    el.addEventListener("scroll", report, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", report);
    };
  }, [sending, publish, key, ref]);

  const incoming = received[key] as
    | { top: number; left: number; height: number; width: number }
    | undefined;

  useEffect(() => {
    const el = ref.current;
    if (!receiving || !el || !incoming) return;
    const top =
      incoming.height > 0 ? (incoming.top / incoming.height) * el.scrollHeight : incoming.top;
    const left =
      incoming.width > 0 ? (incoming.left / incoming.width) * el.scrollWidth : incoming.left;
    el.scrollTop = top;
    el.scrollLeft = left;
  }, [receiving, incoming, ref]);
}
