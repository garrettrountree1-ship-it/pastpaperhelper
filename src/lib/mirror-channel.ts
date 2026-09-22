import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

/**
 * One shared live connection per class lesson.
 *
 * Several parts of a lesson page listen to the same class at once (the class
 * page watcher, the lesson workspace, the class viewer). Opening a separate
 * connection for each of them made the whole lesson drop whenever any single
 * part closed - for example when a live question window disappeared - and the
 * only way back was reloading the page. Everything now shares a single
 * connection per class, counted so it closes only when the last part leaves,
 * and it quietly re-opens itself whenever the network drops it.
 */

export type MirrorListener = {
  onLesson?: (payload: unknown) => void;
  onHello?: (payload: unknown) => void;
  /** Called every time the shared connection becomes live (including re-opens). */
  onSubscribed?: () => void;
};

export type MirrorHandle = {
  send: (event: string, payload: Record<string, unknown>) => void;
  close: () => void;
};

type Entry = {
  channel: RealtimeChannel | null;
  listeners: Set<MirrorListener>;
  rejoinTimer: number | null;
  watchdog: number | null;
  attempts: number;
  opening: boolean;
};

const entries = new Map<string, Entry>();

let authWatched = false;

/** Realtime keeps the token it was given, so refresh it when sign-in changes. */
function watchAuthOnce() {
  if (authWatched || typeof window === "undefined") return;
  authWatched = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
  });
}

function fanOut(entry: Entry, pick: (listener: MirrorListener) => (() => void) | undefined) {
  for (const listener of [...entry.listeners]) {
    try {
      pick(listener)?.();
    } catch {
      // One listener failing must never take the shared connection down.
    }
  }
}

function scheduleRejoin(topic: string, entry: Entry) {
  if (entry.rejoinTimer !== null || entry.listeners.size === 0) return;
  const wait = Math.min(8000, 500 * 2 ** Math.min(entry.attempts, 4));
  entry.attempts += 1;
  entry.rejoinTimer = window.setTimeout(() => {
    entry.rejoinTimer = null;
    void open(topic, entry);
  }, wait);
}

async function open(topic: string, entry: Entry) {
  if (entry.listeners.size === 0 || entry.opening) return;
  entry.opening = true;
  try {
    const previous = entry.channel;
    entry.channel = null;
    if (previous) await supabase.removeChannel(previous).catch(() => undefined);
    if (entry.listeners.size === 0) return;

    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      await supabase.realtime.setAuth(data.session.access_token);
    }
    if (entry.listeners.size === 0) return;

    const channel = supabase.channel(topic, { config: { broadcast: { self: false } } });
    entry.channel = channel;
    channel.on("broadcast", { event: "lesson" }, ({ payload }) =>
      fanOut(entry, (listener) => listener.onLesson && (() => listener.onLesson?.(payload))),
    );
    channel.on("broadcast", { event: "hello" }, ({ payload }) =>
      fanOut(entry, (listener) => listener.onHello && (() => listener.onHello?.(payload))),
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        entry.attempts = 0;
        fanOut(entry, (listener) => listener.onSubscribed);
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (entry.channel === channel) scheduleRejoin(topic, entry);
      }
    });
  } finally {
    entry.opening = false;
  }
}

function startWatchdog(topic: string, entry: Entry) {
  if (entry.watchdog !== null) return;
  // A socket can die silently on school Wi-Fi without any status message, so
  // the connection is checked regularly and re-opened when it is not live.
  entry.watchdog = window.setInterval(() => {
    if (entry.listeners.size === 0 || entry.opening || entry.rejoinTimer !== null) return;
    const state = entry.channel?.state;
    if (state === "joined" || state === "joining") return;
    scheduleRejoin(topic, entry);
  }, 4000);
}

/** Joins (or re-uses) the shared live connection for one class lesson. */
export function openMirrorChannel(topic: string, listener: MirrorListener): MirrorHandle {
  watchAuthOnce();
  let entry = entries.get(topic);
  if (!entry) {
    entry = {
      channel: null,
      listeners: new Set(),
      rejoinTimer: null,
      watchdog: null,
      attempts: 0,
      opening: false,
    };
    entries.set(topic, entry);
  }
  const current = entry;
  current.listeners.add(listener);
  startWatchdog(topic, current);
  if (!current.channel && !current.opening) void open(topic, current);
  else if (current.channel?.state === "joined") {
    // A part that joins an already-live lesson still needs its first snapshot.
    try {
      listener.onSubscribed?.();
    } catch {
      /* ignore */
    }
  }

  let closed = false;
  return {
    send: (event, payload) => {
      if (closed) return;
      const channel = current.channel;
      if (!channel || channel.state !== "joined") return;
      void channel.send({ type: "broadcast", event, payload });
    },
    close: () => {
      if (closed) return;
      closed = true;
      current.listeners.delete(listener);
      if (current.listeners.size > 0) return;
      if (current.rejoinTimer !== null) window.clearTimeout(current.rejoinTimer);
      if (current.watchdog !== null) window.clearInterval(current.watchdog);
      current.rejoinTimer = null;
      current.watchdog = null;
      const closing = current.channel;
      current.channel = null;
      entries.delete(topic);
      if (closing) void supabase.removeChannel(closing).catch(() => undefined);
    },
  };
}
