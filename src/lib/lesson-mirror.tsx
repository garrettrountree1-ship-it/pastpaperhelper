import type { RealtimeChannel } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Live lesson sharing.
 *
 * Two things travel from the teacher's lesson screen to the students:
 *
 * - "content" — the work itself: what is typed, drawn, highlighted or moved on
 *   the lesson canvas and on the document.
 * - "view" — where the teacher is looking: which lesson page and resource,
 *   the window layout, zoom and scroll position.
 * Both scopes travel only while the teacher is presenting with mirroring on,
 * and students only apply them while they are also in present mode.
 */

type Fields = Record<string, unknown>;
export type MirrorScope = "content" | "view";

export type MirrorApi = {
  /** This screen is mirroring its view out (teacher, presenting, mirroring on). */
  sending: boolean;
  /** This screen is following the teacher's view. */
  receiving: boolean;
  /** This screen is broadcasting its live work. */
  liveSending: boolean;
  /** This screen shows the teacher's live work. */
  liveReceiving: boolean;
  mirrorOn: boolean;
  setMirrorOn: (next: boolean) => void;
  publish: (key: string, value: unknown, scope?: MirrorScope) => void;
  received: Fields;
};

const idleApi: MirrorApi = {
  sending: false,
  receiving: false,
  liveSending: false,
  liveReceiving: false,
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

type Payload = {
  from?: string;
  viewActive?: boolean;
  content?: Fields;
  view?: Fields;
};

/** Builds the live connection. Used once, by the lesson workspace. */
export function useLessonMirrorState({
  classId,
  isTeacher,
  presenting,
  presenterIds,
}: {
  classId: string;
  isTeacher: boolean;
  presenting: boolean;
  /** Accounts a student will accept a shared screen from. */
  presenterIds: string[];
}): MirrorApi {
  const [mirrorOn, setMirrorOn] = useState(false);
  const [viewActive, setViewActive] = useState(false);
  const [received, setReceived] = useState<Fields>({});
  const [selfId, setSelfId] = useState<string | null>(null);

  const allContent = useRef<Fields>({});
  const allView = useRef<Fields>({});
  const pendingContent = useRef<Fields>({});
  const pendingView = useRef<Fields>({});

  const topic = `lesson-mirror:${classId}`;
  const sending = isTeacher && presenting && mirrorOn;
  const receiving = !isTeacher && presenting && viewActive;
  const allowed = presenterIds.join(",");

  // Leaving present mode always stops view mirroring.
  useEffect(() => {
    if (!presenting) setMirrorOn(false);
  }, [presenting]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSelfId(data.user?.id ?? null));
  }, []);

  const publish = useCallback((key: string, value: unknown, scope: MirrorScope = "view") => {
    if (scope === "content") {
      allContent.current[key] = value;
      pendingContent.current[key] = value;
    } else {
      allView.current[key] = value;
      pendingView.current[key] = value;
    }
  }, []);

  // The teacher's work streams out continuously; the view only while mirroring.
  // Kept in a ref so switching mirroring never rebuilds the connection.
  const sendingRef = useRef(sending);
  sendingRef.current = sending;
  const presentingRef = useRef(presenting);
  presentingRef.current = presenting;

  useEffect(() => {
    if (!isTeacher || !selfId) return;
    let channel: RealtimeChannel | null = supabase.channel(topic, {
      config: { broadcast: { self: false } },
    });

    const send = (payload: Payload) => {
      void channel?.send({
        type: "broadcast",
        event: "lesson",
        payload: { from: selfId, ...payload },
      });
    };
    const sendAll = () =>
      send({
        viewActive: sendingRef.current,
        content: allContent.current,
        ...(sendingRef.current ? { view: allView.current } : {}),
      });

    channel.on("broadcast", { event: "hello" }, () => sendAll());
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") sendAll();
    });

    let lastView = sendingRef.current;
    let lastSnapshot = 0;
    const timer = setInterval(() => {
      const content = pendingContent.current;
      const view = pendingView.current;
      const viewChanged = lastView !== sendingRef.current;
      const hasContent = Object.keys(content).length > 0;
      const hasView = sendingRef.current && Object.keys(view).length > 0;
      const now = Date.now();
      const heartbeatDue = sendingRef.current && now - lastSnapshot >= 1000;
      if (!viewChanged && !hasContent && !hasView && !heartbeatDue) return;
      pendingContent.current = {};
      pendingView.current = {};
      if (viewChanged || heartbeatDue) {
        lastView = sendingRef.current;
        lastSnapshot = now;
        // Turning mirroring on, reconnecting, and the regular heartbeat all
        // hand students a complete picture rather than relying on one event.
        sendAll();
        return;
      }
      send({
        viewActive: sendingRef.current,
        ...(hasContent ? { content } : {}),
        ...(hasView ? { view } : {}),
      });
    }, 120);

    return () => {
      clearInterval(timer);
      send({ viewActive: false });
      const closing = channel;
      channel = null;
      if (closing) void supabase.removeChannel(closing);
    };
  }, [isTeacher, selfId, topic]);

  // Students always listen, so the teacher's work appears live. View updates are
  // only applied while they are in present mode and the teacher is mirroring.
  const studentChannel = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (isTeacher) return;
    const trusted = allowed ? allowed.split(",") : [];
    const channel = supabase.channel(topic, { config: { broadcast: { self: false } } });
    studentChannel.current = channel;

    channel.on("broadcast", { event: "lesson" }, ({ payload }) => {
      const message = payload as Payload;
      if (trusted.length > 0 && (!message.from || !trusted.includes(message.from))) return;
      setViewActive(message.viewActive === true);
      if (!presentingRef.current || message.viewActive !== true) return;
      const patch = { ...(message.content ?? {}), ...(message.view ?? {}) };
      if (Object.keys(patch).length > 0) {
        setReceived((current) => ({ ...current, ...patch }));
      }
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.send({ type: "broadcast", event: "hello", payload: {} });
      }
    });
    return () => {
      studentChannel.current = null;
      setViewActive(false);
      void supabase.removeChannel(channel);
    };
  }, [isTeacher, topic, allowed]);

  // Ask repeatedly until the active teacher answers. This covers students who
  // enter while the teacher's channel is reconnecting or has not subscribed yet.
  useEffect(() => {
    if (isTeacher || !presenting) return;
    const ask = () =>
      void studentChannel.current?.send({ type: "broadcast", event: "hello", payload: {} });
    ask();
    if (viewActive) return;
    const timer = window.setInterval(ask, 1500);
    return () => window.clearInterval(timer);
  }, [isTeacher, presenting, viewActive]);

  return {
    sending,
    receiving,
    liveSending: sending,
    liveReceiving: receiving,
    mirrorOn,
    setMirrorOn,
    publish,
    received,
  };
}

/** Keeps one piece of lesson state in step with the teacher's screen. */
export function useMirrorFieldWith<T>(
  api: MirrorApi,
  key: string,
  value: T,
  apply: (next: T) => void,
  scope: MirrorScope = "view",
) {
  const { sending, receiving, liveSending, liveReceiving, publish, received } = api;
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const send = scope === "content" ? liveSending : sending;
  const take = scope === "content" ? liveReceiving : receiving;

  useEffect(() => {
    if (send) publish(key, value, scope);
  }, [send, publish, key, value, scope]);

  const incoming = received[key];
  useEffect(() => {
    if (!take || incoming === undefined) return;
    applyRef.current(incoming as T);
  }, [take, incoming]);
}

export function useMirrorField<T>(
  key: string,
  value: T,
  apply: (next: T) => void,
  scope: MirrorScope = "view",
) {
  useMirrorFieldWith(useLessonMirror(), key, value, apply, scope);
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
