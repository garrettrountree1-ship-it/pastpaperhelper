import { GAME_KEYS, type GameKey } from "@/lib/game-catalog";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Db = Awaited<ReturnType<typeof admin>>;

/** Games are on unless the teacher has explicitly switched them off. */
export async function disabledGamesFor(classIds: string[]): Promise<Record<string, GameKey[]>> {
  if (classIds.length === 0) return {};
  const db = await admin();
  const { data } = await db
    .from("class_game_settings")
    .select("class_id, game_key, enabled")
    .in("class_id", classIds);
  const map: Record<string, GameKey[]> = {};
  for (const row of data ?? []) {
    if (row.enabled) continue;
    const list = map[row.class_id] ?? [];
    list.push(row.game_key as GameKey);
    map[row.class_id] = list;
  }
  return map;
}

export async function isGameEnabled(classId: string, gameKey: GameKey) {
  const map = await disabledGamesFor([classId]);
  return !(map[classId] ?? []).includes(gameKey);
}

/** Throws with a student-friendly message when the teacher has turned a game off. */
export async function assertGameEnabled(classId: string, gameKey: GameKey) {
  if (!(await isGameEnabled(classId, gameKey))) {
    throw new Error("Your teacher has turned this game off.");
  }
}

/** Keeps only the classes where a game is still switched on. */
export async function filterEnabledClasses<T extends { id: string }>(
  classes: T[],
  gameKey: GameKey,
) {
  const map = await disabledGamesFor(classes.map((c) => c.id));
  return classes.filter((c) => !(map[c.id] ?? []).includes(gameKey));
}

export async function readGameSettings(classId: string) {
  const map = await disabledGamesFor([classId]);
  const off = new Set(map[classId] ?? []);
  return GAME_KEYS.map((key) => ({ key, enabled: !off.has(key) }));
}

export async function writeGameSetting(input: {
  classId: string;
  gameKey: GameKey;
  enabled: boolean;
  teacherId: string;
}) {
  const db = await admin();
  const { error } = await db.from("class_game_settings").upsert(
    {
      class_id: input.classId,
      game_key: input.gameKey,
      enabled: input.enabled,
      updated_by: input.teacherId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "class_id,game_key" },
  );
  if (error) throw new Error(error.message);
  return { enabled: input.enabled };
}

export type GameEvent = {
  id: string;
  game: GameKey;
  at: string;
  outcome: "win" | "loss" | "pending";
  detail: string;
  awarded: number;
  attempts: number;
};

export type StudentGameRecord = {
  studentId: string;
  alias: string;
  name: string;
  tokens: number;
  plays: number;
  wins: number;
  losses: number;
  pending: number;
  events: GameEvent[];
};

const ROUND_GAME: Record<string, GameKey> = {
  vocab_bingo: "vocab_bingo",
  boss: "boss_question",
  wager: "wager_round",
};

/** Full play-by-play record of every game attempt in a class, per student. */
export async function loadClassGameRecord(classId: string): Promise<StudentGameRecord[]> {
  const db: Db = await admin();

  const [{ data: members }, { data: profiles }, { data: matches }, { data: doubles }, { data: rounds }] =
    await Promise.all([
      db.from("class_members").select("student_id").eq("class_id", classId),
      db.from("game_profiles").select("student_id, alias, tokens").eq("class_id", classId),
      db
        .from("game_matches")
        .select("id, student_a, student_b, winner_id, resolved_at, created_at")
        .eq("class_id", classId)
        .order("created_at", { ascending: false }),
      db
        .from("daily_doubles")
        .select("id, student_id, correct, awarded, attempts, started_at, finished_at")
        .eq("class_id", classId)
        .order("started_at", { ascending: false }),
      db
        .from("game_rounds")
        .select("id, student_id, kind, correct, awarded, attempts, wager, started_at, finished_at")
        .eq("class_id", classId)
        .order("started_at", { ascending: false }),
    ]);

  const matchIds = (matches ?? []).map((m) => m.id);
  const { data: attempts } = matchIds.length
    ? await db
        .from("game_attempts")
        .select("match_id, student_id, correct, attempts, seconds, finished_at")
        .in("match_id", matchIds)
    : { data: [] as Record<string, never>[] };

  const studentIds = new Set<string>([
    ...(members ?? []).map((m) => m.student_id),
    ...(profiles ?? []).map((p) => p.student_id),
  ]);
  const { data: names } = studentIds.size
    ? await db.from("profiles").select("id, full_name").in("id", [...studentIds])
    : { data: [] as { id: string; full_name: string }[] };

  const records = new Map<string, StudentGameRecord>();
  const record = (studentId: string) => {
    let row = records.get(studentId);
    if (!row) {
      const profile = (profiles ?? []).find((p) => p.student_id === studentId);
      row = {
        studentId,
        alias: profile?.alias ?? "—",
        name: (names ?? []).find((n) => n.id === studentId)?.full_name || "Student",
        tokens: profile?.tokens ?? 0,
        plays: 0,
        wins: 0,
        losses: 0,
        pending: 0,
        events: [],
      };
      records.set(studentId, row);
    }
    return row;
  };
  for (const id of studentIds) record(id);

  const push = (studentId: string, event: GameEvent) => {
    const row = record(studentId);
    row.events.push(event);
    row.plays += 1;
    if (event.outcome === "win") row.wins += 1;
    else if (event.outcome === "loss") row.losses += 1;
    else row.pending += 1;
  };

  const aliasOf = (studentId: string) =>
    (profiles ?? []).find((p) => p.student_id === studentId)?.alias ?? "classmate";

  for (const match of matches ?? []) {
    for (const studentId of [match.student_a, match.student_b]) {
      const opponent = studentId === match.student_a ? match.student_b : match.student_a;
      const mine = (attempts ?? []).find(
        (a: { match_id: string; student_id: string }) =>
          a.match_id === match.id && a.student_id === studentId,
      ) as
        | { correct: boolean; attempts: number; seconds: number | null; finished_at: string | null }
        | undefined;
      const outcome: GameEvent["outcome"] = !match.resolved_at
        ? "pending"
        : match.winner_id === studentId
          ? "win"
          : "loss";
      const seconds = mine?.seconds ? ` in ${Math.round(Number(mine.seconds))}s` : "";
      push(studentId, {
        id: `${match.id}-${studentId}`,
        game: "head_to_head",
        at: match.created_at,
        outcome,
        awarded: outcome === "win" ? 1 : 0,
        attempts: mine?.attempts ?? 0,
        detail:
          `vs ${aliasOf(opponent)} — ` +
          (!mine?.finished_at
            ? "not answered yet"
            : `${mine.correct ? "fully correct" : "not fully correct"}${seconds}`),
      });
    }
  }

  for (const row of doubles ?? []) {
    push(row.student_id, {
      id: row.id,
      game: "daily_double",
      at: row.started_at,
      outcome: !row.finished_at ? "pending" : row.correct ? "win" : "loss",
      awarded: row.awarded ?? 0,
      attempts: row.attempts ?? 0,
      detail: !row.finished_at
        ? "in progress"
        : row.correct
          ? "answered correctly"
          : "did not get full marks",
    });
  }

  for (const row of rounds ?? []) {
    const game = ROUND_GAME[row.kind];
    if (!game) continue;
    push(row.student_id, {
      id: row.id,
      game,
      at: row.started_at,
      outcome: !row.finished_at ? "pending" : row.correct ? "win" : "loss",
      awarded: row.awarded ?? 0,
      attempts: row.attempts ?? 0,
      detail:
        game === "wager_round"
          ? `staked ${row.wager} token(s)`
          : !row.finished_at
            ? "in progress"
            : row.correct
              ? "completed"
              : "not completed",
    });
  }

  const list = [...records.values()];
  for (const row of list) {
    row.events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }
  return list.sort((a, b) => b.plays - a.plays || b.tokens - a.tokens);
}
