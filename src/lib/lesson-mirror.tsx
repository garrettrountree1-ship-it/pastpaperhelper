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
 * Both scopes travel while the teacher has mirroring on, in either the normal
 * or full-screen lesson workspace.
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

type Chunk = {
  scope: MirrorScope;
  key: string;
  id: string;
  index: number;
  total: number;
  data: string;
};

type Payload = {
  from?: string;
  sessionId?: string;
  viewActive?: boolean;
  finalView?: boolean;
  content?: Fields;
  view?: Fields;
  /** One slice of a single large piece of work (e.g. a pasted photo). */
  chunk?: Chunk;
};

/**
 * A live update has to fit in one message. Pasted photos, long pages of
 * drawing and a whole marked-up document are far bigger than that, so updates
 * are split across several messages and put back together on arrival.
 * Without this the message is simply dropped and the students see nothing.
 */
const MAX_CHARS = 80_000;

/** Builds the live connection. Used once, by the lesson workspace. */
export function useLessonMirrorState({
  classId,
  isTeacher,
  presenting: _presenting,
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
  const activePresenter = useRef<string | null>(null);
  const activeSession = useRef<string | null>(null);
  const sessionId = useRef<string | null>(null);
  const trustedPresenters = useRef<string[]>(presenterIds);
  trustedPresenters.current = presenterIds;

  const topic = `lesson-mirror:${classId}`;
  const sending = isTeacher && mirrorOn;
  const receiving = !isTeacher && viewActive;

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSelfId(data.user?.id ?? null));
  }, []);

  // The teacher's work streams out continuously; the view only while mirroring.
  // Kept in a ref so switching mirroring never rebuilds the connection.
  const sendingRef = useRef(sending);
  sendingRef.current = sending;
  const publish = useCallback((key: string, value: unknown, scope: MirrorScope = "view") => {
    if (scope === "content") {
      allContent.current[key] = value;
      if (sendingRef.current) pendingContent.current[key] = value;
    } else {
      allView.current[key] = value;
      if (sendingRef.current) pendingView.current[key] = value;
    }
  }, []);

  useEffect(() => {
    if (!isTeacher || !selfId) return;
    if (sendingRef.current && !sessionId.current) sessionId.current = crypto.randomUUID();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const send = (payload: Payload) => {
      void channel?.send({
        type: "broadcast",
        event: "lesson",
        payload: { from: selfId, ...payload },
      });
    };
    const meta = () => ({
      ...(sessionId.current ? { sessionId: sessionId.current } : {}),
      viewActive: sendingRef.current,
    });

    const sendChunked = (scope: MirrorScope, key: string, value: unknown) => {
      const json = JSON.stringify(value ?? null);
      const id = crypto.randomUUID();
      const total = Math.ceil(json.length / MAX_CHARS) || 1;
      for (let index = 0; index < total; index += 1) {
        send({
          ...meta(),
          chunk: {
            scope,
            key,
            id,
            index,
            total,
            data: json.slice(index * MAX_CHARS, (index + 1) * MAX_CHARS),
          },
        });
      }
    };

    /** Sends work and view together, in as many messages as their size needs. */
    const sendFields = (content: Fields, view: Fields, extra: Payload = {}) => {
      const entries: Array<[MirrorScope, string, unknown, number]> = [];
      for (const [key, value] of Object.entries(content)) {
        entries.push(["content", key, value, JSON.stringify(value ?? null).length]);
      }
      for (const [key, value] of Object.entries(view)) {
        entries.push(["view", key, value, JSON.stringify(value ?? null).length]);
      }
      let bucketContent: Fields = {};
      let bucketView: Fields = {};
      let size = 0;
      let sentAny = false;
      const flush = () => {
        if (Object.keys(bucketContent).length === 0 && Object.keys(bucketView).length === 0) return;
        send({ ...meta(), content: bucketContent, view: bucketView });
        sentAny = true;
        bucketContent = {};
        bucketView = {};
        size = 0;
      };
      for (const [scope, key, value, len] of entries) {
        if (len > MAX_CHARS) {
          flush();
          sendChunked(scope, key, value);
          sentAny = true;
          continue;
        }
        if (size + len > MAX_CHARS) flush();
        if (scope === "content") bucketContent[key] = value;
        else bucketView[key] = value;
        size += len;
      }
      flush();
      if (Object.keys(extra).length > 0 || !sentAny) send({ ...meta(), ...extra });
    };

    const sendAll = () =>
      sendFields(allContent.current, sendingRef.current ? allView.current : {});

    void (async () => {
      // Realtime can retain an older token after a long-lived school session.
      // Authenticate explicitly before every lesson channel is opened so the
      // current signed-in account is used without requiring a logout/refresh.
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        await supabase.realtime.setAuth(data.session.access_token);
      }
      if (cancelled) return;

      channel = supabase.channel(topic, { config: { broadcast: { self: false } } });
      channel.on("broadcast", { event: "hello" }, () => sendAll());
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") sendAll();
      });

      let lastView = sendingRef.current;
      let lastSnapshot = 0;
      let stopRepeats = 0;
      timer = setInterval(() => {
        const content = pendingContent.current;
        const view = pendingView.current;
        const viewChanged = lastView !== sendingRef.current;
        const hasContent = Object.keys(content).length > 0;
        const hasView = sendingRef.current && Object.keys(view).length > 0;
        const now = Date.now();
        const heartbeatDue = sendingRef.current && now - lastSnapshot >= 1000;
        if (!viewChanged && !hasContent && !hasView && !heartbeatDue && stopRepeats === 0) return;
        pendingContent.current = {};
        pendingView.current = {};
        if (viewChanged) {
          lastView = sendingRef.current;
          lastSnapshot = now;
          if (sendingRef.current) {
            sessionId.current = crypto.randomUUID();
            stopRepeats = 0;
          } else {
            stopRepeats = 8;
          }
          if (sendingRef.current) {
            sendAll();
          } else {
            send({
              ...(sessionId.current ? { sessionId: sessionId.current } : {}),
              viewActive: false,
              finalView: true,
              view: allView.current,
            });
          }
          return;
        }
        if (heartbeatDue) {
          lastSnapshot = now;
          sendAll();
          return;
        }
        if (!sendingRef.current && stopRepeats > 0) {
          stopRepeats -= 1;
          send({
            ...(sessionId.current ? { sessionId: sessionId.current } : {}),
            viewActive: false,
          });
          return;
        }
        send({
          ...(sessionId.current ? { sessionId: sessionId.current } : {}),
          viewActive: sendingRef.current,
          ...(hasContent ? { content } : {}),
          ...(hasView ? { view } : {}),
        });
      }, 120);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      send({ viewActive: false });
      const closing = channel;
      channel = null;
      if (closing) void supabase.removeChannel(closing);
    };
  }, [isTeacher, selfId, topic]);

  // Students always listen, so the teacher's workspace appears live whether
  // either person is using the normal or full-screen lesson view.
  const studentChannel = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (isTeacher) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const receive = ({ payload }: { payload: unknown }) => {
      const message = payload as Payload;
      if (!message.from || !trustedPresenters.current.includes(message.from)) return;
      if (
        message.viewActive === false &&
        message.sessionId &&
        activeSession.current &&
        message.sessionId !== activeSession.current
      ) {
        // A delayed stop from an older run must never cancel a newer mirror.
        return;
      }
      if (message.viewActive === true) {
        activePresenter.current = message.from;
      } else if (activePresenter.current && activePresenter.current !== message.from) {
        return;
      } else if (message.viewActive === false) {
        activePresenter.current = null;
      }
      const patch = { ...(message.content ?? {}), ...(message.view ?? {}) };
      if (Object.keys(patch).length > 0) {
        const isNewSession = Boolean(
          message.sessionId && activeSession.current !== message.sessionId,
        );
        if (message.sessionId) activeSession.current = message.sessionId;
        setReceived((current) => (isNewSession ? patch : { ...current, ...patch }));
      }
      if (message.finalView) {
        // Let mirrored fields consume the teacher's final document and scroll
        // position before unlocking the student's workspace at that location.
        const endingSession = message.sessionId ?? null;
        window.requestAnimationFrame(() => {
          if (activeSession.current !== endingSession) return;
          activeSession.current = null;
          setViewActive(false);
        });
        return;
      }
      if (message.viewActive === false) activeSession.current = null;
      setViewActive(message.viewActive === true);
    };

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        await supabase.realtime.setAuth(data.session.access_token);
      }
      if (cancelled) return;

      channel = supabase.channel(topic, { config: { broadcast: { self: false } } });
      studentChannel.current = channel;
      channel.on("broadcast", { event: "lesson" }, receive);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel?.send({ type: "broadcast", event: "hello", payload: {} });
        }
      });
    })();
    return () => {
      cancelled = true;
      studentChannel.current = null;
      activePresenter.current = null;
      activeSession.current = null;
      setViewActive(false);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [isTeacher, topic]);

  // Ask repeatedly until the active teacher answers. This covers students who
  // enter while the teacher's channel is reconnecting or has not subscribed yet.
  useEffect(() => {
    if (isTeacher) return;
    const ask = () =>
      void studentChannel.current?.send({ type: "broadcast", event: "hello", payload: {} });
    ask();
    if (viewActive) return;
    const timer = window.setInterval(ask, 1500);
    return () => window.clearInterval(timer);
  }, [isTeacher, viewActive]);

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

  const take = scope === "content" ? liveReceiving : receiving;

  useEffect(() => {
    publish(key, value, scope);
  }, [publish, key, value, scope]);

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
 * On a narrow screen a pane grows to its content and the page around it does
 * the scrolling instead, so follow the element that really scrolls.
 */
function scrollTargetOf(el: HTMLElement): HTMLElement {
  if (el.scrollHeight - el.clientHeight > 4 || el.scrollWidth - el.clientWidth > 4) return el;
  let parent: HTMLElement | null = el.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const scrolls = /(auto|scroll|overlay)/.test(`${style.overflowY}${style.overflowX}`);
    if (scrolls && (parent.scrollHeight - parent.clientHeight > 4 || parent.scrollWidth - parent.clientWidth > 4)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return el;
}


/**
 * Mirrors scrolling of a pane. Positions travel as a fraction of the scrollable
 * length, so a student on a smaller screen still follows the same place.
 */
export function useMirrorScroll(
  key: string,
  ref: React.RefObject<HTMLElement | null>,
  options?: {
    /**
     * The two screens share the same coordinate space (same sheet length and
     * zoom), so the teacher's position is copied across pixel for pixel.
     */
    exact?: boolean;
  },
) {
  const exact = options?.exact ?? false;
  const { sending, receiving, publish, received } = useLessonMirror();

  // Document panes mount their scroller only after the file has finished
  // rendering, and they remount it whenever the file is rebuilt, so keep
  // checking instead of capturing the element once.
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const sync = () => setEl((current) => (current === ref.current ? current : ref.current));
    sync();
    const timer = window.setInterval(sync, 300);
    return () => window.clearInterval(timer);
  }, [ref, receiving, sending]);

  useEffect(() => {
    if (!el) return;
    let frame = 0;
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = scrollTargetOf(el);
        publish(key, {
          top: target.scrollTop,
          left: target.scrollLeft,
          height: target.scrollHeight,
          width: target.scrollWidth,
          clientHeight: target.clientHeight,
          clientWidth: target.clientWidth,
        });
      });
    };
    report();
    // The pane's own scroller, or whichever ancestor actually scrolls on a
    // narrower screen, both need watching.
    const heartbeat = window.setInterval(report, 400);
    el.addEventListener("scroll", report, { passive: true });
    document.addEventListener("scroll", report, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(heartbeat);
      el.removeEventListener("scroll", report);
      document.removeEventListener("scroll", report, { capture: true } as never);
    };
  }, [publish, key, el]);


  const incoming = received[key] as
    | {
        top: number;
        left: number;
        height: number;
        width: number;
        clientHeight?: number;
        clientWidth?: number;
      }
    | undefined;

  const incomingRef = useRef(incoming);
  incomingRef.current = incoming;

  useEffect(() => {
    if (!receiving || !el) return;

    const applyTeacherPosition = () => {
      const position = incomingRef.current;
      if (!position) return;
      const target = scrollTargetOf(el);
      const teacherTopRange = Math.max(
        0,
        position.height - (position.clientHeight ?? 0),
      );
      const teacherLeftRange = Math.max(
        0,
        position.width - (position.clientWidth ?? 0),
      );
      const studentTopRange = Math.max(0, target.scrollHeight - target.clientHeight);
      const studentLeftRange = Math.max(0, target.scrollWidth - target.clientWidth);
      const top = exact
        ? Math.min(position.top, studentTopRange)
        : teacherTopRange > 0
          ? (position.top / teacherTopRange) * studentTopRange
          : Math.min(position.top, studentTopRange);
      const left = exact
        ? Math.min(position.left, studentLeftRange)
        : teacherLeftRange > 0
          ? (position.left / teacherLeftRange) * studentLeftRange
          : Math.min(position.left, studentLeftRange);
      if (Math.abs(target.scrollTop - top) > 0.5) target.scrollTop = top;
      if (Math.abs(target.scrollLeft - left) > 0.5) target.scrollLeft = left;
    };


    applyTeacherPosition();
    const hold = window.setInterval(applyTeacherPosition, 60);
    const observer = new ResizeObserver(applyTeacherPosition);
    observer.observe(el);
    return () => {
      window.clearInterval(hold);
      observer.disconnect();
    };
  }, [receiving, incoming, el, exact]);
}
