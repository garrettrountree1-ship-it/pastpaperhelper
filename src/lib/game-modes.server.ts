/**
 * Extra token games built on past-paper homework: vocab bingo, the boss
 * question and the wager round. Server-only.
 */
import { DAILY_TOKEN_CAP } from "./game-alias";
import {
  admin,
  awardTokens,
  ensureProfile,
  gradeGameAnswer,
  pickClassQuestion,
  seenQuestionIds,
  signPaperPages,
  today,
  type GameDb,
} from "./game-core.server";

export type BingoCell = { term: string; translation: string; short: string };

const LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1 > 0 ? copy.length - 1 : 0; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

async function memberClasses(
  db: GameDb,
  studentId: string,
  gameKey?: import("@/lib/game-catalog").GameKey,
) {
  const { data } = await db
    .from("class_members")
    .select("class_id, classes(id, name, subject, tutor_language)")
    .eq("student_id", studentId);
  const classes = (data ?? [])
    .map((row) => row.classes)
    .filter(
      (c): c is { id: string; name: string; subject: string; tutor_language: string } => Boolean(c),
    );
  if (!gameKey) return classes;
  const { filterEnabledClasses } = await import("./game-admin.server");
  return filterEnabledClasses(classes, gameKey);
}

/* ------------------------------------------------------------ vocab bingo -- */

async function buildBingoCard(db: GameDb, classId: string): Promise<BingoCell[]> {
  const { data: klass } = await db
    .from("classes")
    .select("subject, tutor_language")
    .eq("id", classId)
    .single();
  const { data: assignments } = await db
    .from("assignments")
    .select("id")
    .eq("class_id", classId)
    .eq("published", true);
  const assignmentIds = (assignments ?? []).map((a) => a.id);
  if (assignmentIds.length === 0) return [];

  const { data: vocabRows } = await db
    .from("assignment_vocab")
    .select("terms")
    .in("assignment_id", assignmentIds);

  const pool: BingoCell[] = [];
  const seen = new Set<string>();
  const push = (item: { term?: unknown; translation?: unknown; short?: unknown }) => {
    const term = String(item.term ?? "").trim();
    const key = term.toLowerCase();
    if (!term || seen.has(key)) return;
    seen.add(key);
    pool.push({
      term,
      translation: String(item.translation ?? "").trim(),
      short: String(item.short ?? "").trim(),
    });
  };
  for (const row of vocabRows ?? []) {
    for (const item of (row.terms ?? []) as { term?: unknown }[]) push(item);
  }

  if (pool.length < 9) {
    const { data: questions } = await db
      .from("questions")
      .select("question_text")
      .in("assignment_id", assignmentIds)
      .limit(30);
    const texts = (questions ?? []).map((q) => q.question_text);
    if (texts.length > 0) {
      const { assignmentVocab } = await import("./vocab.server");
      const items = await assignmentVocab(
        texts,
        klass?.subject ?? "",
        klass?.tutor_language ?? "English",
      );
      for (const item of items) push(item);
    }
  }

  return shuffle(pool.filter((cell) => cell.translation || cell.short)).slice(0, 9);
}

export async function loadVocabBingo(studentId: string, classId?: string) {
  const db = await admin();
  const classes = await memberClasses(db, studentId, "vocab_bingo");
  if (classes.length === 0) throw new Error("Vocab bingo is not available in your classes right now.");

  const { data: existing } = await db
    .from("game_rounds")
    .select("id, class_id, payload, state, ends_at, finished_at, awarded, attempts")
    .eq("student_id", studentId)
    .eq("kind", "vocab_bingo")
    .eq("day", today())
    .maybeSingle();

  let row = existing;
  if (!row) {
    const chosen = classId
      ? classes.find((c) => c.id === classId)
      : shuffle(classes)[0];
    if (!chosen) throw new Error("You are not in this class.");
    const cells = await buildBingoCard(db, chosen.id);
    if (cells.length < 9) {
      throw new Error(
        "Not enough vocabulary yet — open a homework's vocab list first so words can be collected.",
      );
    }
    await ensureProfile(db, chosen.id, studentId);
    const { data: created, error } = await db
      .from("game_rounds")
      .insert({
        class_id: chosen.id,
        student_id: studentId,
        kind: "vocab_bingo",
        payload: { cells, clues: shuffle(cells.map((_, index) => index)) },
        state: { marked: [], clue: 0, lines: 0 },
        ends_at: new Date(Date.now() + 8 * 60_000).toISOString(),
      })
      .select("id, class_id, payload, state, ends_at, finished_at, awarded, attempts")
      .single();
    if (error) throw new Error(error.message);
    row = created;
  }

  const expired = new Date(row.ends_at).getTime() <= Date.now();
  if (expired && !row.finished_at) {
    await db
      .from("game_rounds")
      .update({ finished_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  const payload = row.payload as { cells: BingoCell[]; clues: number[] };
  const state = row.state as { marked: number[]; clue: number; lines: number };
  const done = expired || Boolean(row.finished_at) || state.clue >= payload.clues.length;
  const clueIndex = payload.clues[state.clue];

  return {
    id: row.id,
    className: classes.find((c) => c.id === row!.class_id)?.name ?? "Class",
    cells: payload.cells.map((cell) => ({ term: cell.term })),
    marked: state.marked,
    lines: state.lines,
    clueNumber: Math.min(state.clue + 1, payload.clues.length),
    totalClues: payload.clues.length,
    clue:
      done || clueIndex === undefined
        ? null
        : {
            translation: payload.cells[clueIndex]?.translation ?? "",
            hint: payload.cells[clueIndex]?.short ?? "",
          },
    done,
    awarded: row.awarded,
    secondsLeft: Math.max(0, Math.round((new Date(row.ends_at).getTime() - Date.now()) / 1000)),
  };
}

export async function answerVocabBingo(studentId: string, cellIndex: number) {
  const db = await admin();
  const { data: row } = await db
    .from("game_rounds")
    .select("id, class_id, payload, state, ends_at, finished_at, awarded, attempts")
    .eq("student_id", studentId)
    .eq("kind", "vocab_bingo")
    .eq("day", today())
    .maybeSingle();
  if (!row) throw new Error("Start today's bingo card first.");
  if (row.finished_at) throw new Error("Today's bingo card is finished.");
  if (new Date(row.ends_at).getTime() <= Date.now()) {
    await db.from("game_rounds").update({ finished_at: new Date().toISOString() }).eq("id", row.id);
    throw new Error("Time is up — come back tomorrow.");
  }

  const payload = row.payload as { cells: BingoCell[]; clues: number[] };
  const state = row.state as { marked: number[]; clue: number; lines: number };
  const expected = payload.clues[state.clue];
  if (expected === undefined) throw new Error("This card is complete.");

  const correct = cellIndex === expected;
  const marked = correct ? [...new Set([...state.marked, cellIndex])] : state.marked;
  const completedLines = LINES.filter((line) => line.every((cell) => marked.includes(cell))).length;
  const newLines = Math.max(0, completedLines - state.lines);

  let awardedNow = 0;
  if (newLines > 0) {
    awardedNow = await awardTokens(db, {
      classId: row.class_id,
      studentId,
      delta: newLines,
      reason: "Vocab bingo line",
      createdBy: null,
      capped: true,
    });
  }

  const nextClue = state.clue + 1;
  const finished = nextClue >= payload.clues.length || marked.length === payload.cells.length;

  await db
    .from("game_rounds")
    .update({
      state: { marked, clue: nextClue, lines: completedLines },
      attempts: row.attempts + 1,
      correct: completedLines > 0,
      awarded: row.awarded + awardedNow,
      finished_at: finished ? new Date().toISOString() : null,
    })
    .eq("id", row.id);

  return {
    correct,
    correctTerm: payload.cells[expected]?.term ?? "",
    awardedNow,
    newLines,
    // A line was completed but the daily token cap was already reached.
    cappedOut: newLines > 0 && awardedNow < newLines,
    dailyCap: DAILY_TOKEN_CAP,
    lines: completedLines,
    finished,
  };

}

/* ------------------------------------------------------------ boss round -- */

const BOSS_MINUTES = 12;

export async function loadBossQuestion(studentId: string) {
  const db = await admin();
  const { data: existing } = await db
    .from("game_rounds")
    .select("id, class_id, question_id, state, ends_at, finished_at, correct, attempts, awarded")
    .eq("student_id", studentId)
    .eq("kind", "boss")
    .eq("day", today())
    .maybeSingle();

  let row = existing;
  if (!row) {
    const classes = shuffle(await memberClasses(db, studentId, "boss_question"));
    if (classes.length === 0)
      throw new Error("The boss question is not available in your classes right now.");
    const seen = await seenQuestionIds(db, studentId);

    let picked: { classId: string; questionId: string } | null = null;
    for (const exclude of [seen, new Set<string>()]) {
      for (const klass of classes) {
        const question = await pickClassQuestion(db, klass.id, {
          exclude,
          minMarks: 4,
          preferHardest: true,
        });
        if (question) {
          picked = { classId: klass.id, questionId: question.id };
          break;
        }
      }
      if (picked) break;
    }
    if (!picked) throw new Error("No published homework questions available for a boss round yet.");

    await ensureProfile(db, picked.classId, studentId);
    const { data: created, error } = await db
      .from("game_rounds")
      .insert({
        class_id: picked.classId,
        student_id: studentId,
        kind: "boss",
        question_id: picked.questionId,
        ends_at: new Date(Date.now() + BOSS_MINUTES * 60_000).toISOString(),
      })
      .select("id, class_id, question_id, state, ends_at, finished_at, correct, attempts, awarded")
      .single();
    if (error) throw new Error(error.message);
    row = created;
  }

  const { data: question } = await db
    .from("questions")
    .select("question_text, mark_scheme, marks, image_paths")
    .eq("id", row.question_id!)
    .single();

  const expired = new Date(row.ends_at).getTime() <= Date.now();
  if (expired && !row.finished_at) {
    await db.from("game_rounds").update({ finished_at: new Date().toISOString() }).eq("id", row.id);
  }
  const over = expired || Boolean(row.finished_at);

  return {
    id: row.id,
    questionText: question?.question_text ?? "",
    marks: question?.marks ?? 1,
    imageUrls: await signPaperPages(db, question?.image_paths ?? []),
    done: over,
    correct: row.correct,
    attempts: row.attempts,
    awarded: row.awarded,
    // Round over, so showing the mark scheme is teaching, not cheating.
    markScheme: over ? (question?.mark_scheme ?? "") : null,
    secondsLeft: Math.max(0, Math.round((new Date(row.ends_at).getTime() - Date.now()) / 1000)),
  };
}

export async function submitBossAnswer(studentId: string, answerText: string) {
  const db = await admin();
  const { data: row } = await db
    .from("game_rounds")
    .select("id, class_id, question_id, ends_at, finished_at, attempts")
    .eq("student_id", studentId)
    .eq("kind", "boss")
    .eq("day", today())
    .maybeSingle();
  if (!row) throw new Error("Open today's boss question first.");
  if (row.finished_at) throw new Error("Today's boss round is over.");
  if (new Date(row.ends_at).getTime() <= Date.now()) {
    await db.from("game_rounds").update({ finished_at: new Date().toISOString() }).eq("id", row.id);
    throw new Error("Time is up — try again tomorrow.");
  }

  const result = await gradeGameAnswer(db, row.question_id!, row.class_id, answerText);
  if (!result.correct) {
    await db
      .from("game_rounds")
      .update({ attempts: row.attempts + 1, answer_text: answerText })
      .eq("id", row.id);
    return { correct: false, awarded: 0, feedback: result.feedback, markScheme: null };
  }

  const awarded = await awardTokens(db, {
    classId: row.class_id,
    studentId,
    delta: 3,
    reason: "Boss question cleared",
    createdBy: null,
    capped: true,
  });
  await db
    .from("game_rounds")
    .update({
      attempts: row.attempts + 1,
      answer_text: answerText,
      correct: true,
      awarded,
      finished_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  const { data: question } = await db
    .from("questions")
    .select("mark_scheme")
    .eq("id", row.question_id!)
    .single();
  return {
    correct: true,
    awarded,
    feedback: result.feedback,
    markScheme: question?.mark_scheme ?? "",
  };
}

/* ----------------------------------------------------------- wager round -- */

export const MAX_WAGER = 2;

export async function loadWagerRound(studentId: string) {
  const db = await admin();
  const classes = await memberClasses(db, studentId, "wager_round");
  if (classes.length === 0)
    throw new Error("The wager round is not available in your classes right now.");

  const { data: row } = await db
    .from("game_rounds")
    .select("id, class_id, question_id, wager, ends_at, finished_at, correct, attempts, awarded")
    .eq("student_id", studentId)
    .eq("kind", "wager")
    .eq("day", today())
    .maybeSingle();

  if (!row) {
    const { data: profiles } = await db
      .from("game_profiles")
      .select("class_id, tokens")
      .eq("student_id", studentId);
    return {
      stage: "wager" as const,
      maxWager: MAX_WAGER,
      classes: classes.map((klass) => ({
        id: klass.id,
        name: klass.name,
        tokens: (profiles ?? []).find((p) => p.class_id === klass.id)?.tokens ?? 0,
      })),
    };
  }

  const { data: question } = await db
    .from("questions")
    .select("question_text, mark_scheme, marks, image_paths")
    .eq("id", row.question_id!)
    .single();

  const expired = new Date(row.ends_at).getTime() <= Date.now();
  if (expired && !row.finished_at) {
    await db
      .from("game_rounds")
      .update({ finished_at: new Date().toISOString(), awarded: -row.wager })
      .eq("id", row.id);
    await awardTokens(db, {
      classId: row.class_id,
      studentId,
      delta: -row.wager,
      reason: "Wager round — time ran out",
      createdBy: null,
      capped: false,
    });
  }
  const over = expired || Boolean(row.finished_at);

  return {
    stage: "play" as const,
    id: row.id,
    wager: row.wager,
    className: classes.find((c) => c.id === row.class_id)?.name ?? "Class",
    questionText: question?.question_text ?? "",
    marks: question?.marks ?? 1,
    imageUrls: await signPaperPages(db, question?.image_paths ?? []),
    done: over,
    correct: row.correct,
    attempts: row.attempts,
    awarded: row.awarded,
    markScheme: over ? (question?.mark_scheme ?? "") : null,
    secondsLeft: Math.max(0, Math.round((new Date(row.ends_at).getTime() - Date.now()) / 1000)),
  };
}

export async function startWagerRound(studentId: string, classId: string, wager: number) {
  const db = await admin();
  const classes = await memberClasses(db, studentId, "wager_round");
  if (!classes.some((c) => c.id === classId))
    throw new Error("The wager round is not available in this class.");

  const { data: existing } = await db
    .from("game_rounds")
    .select("id")
    .eq("student_id", studentId)
    .eq("kind", "wager")
    .eq("day", today())
    .maybeSingle();
  if (existing) throw new Error("You have already played today's wager round.");

  const profile = await ensureProfile(db, classId, studentId);
  if (profile.tokens < wager) throw new Error("You do not have that many tokens to stake yet.");

  const seen = await seenQuestionIds(db, studentId);
  const question =
    (await pickClassQuestion(db, classId, { exclude: seen })) ??
    (await pickClassQuestion(db, classId));
  if (!question) throw new Error("No published homework questions in this class yet.");

  const { error } = await db.from("game_rounds").insert({
    class_id: classId,
    student_id: studentId,
    kind: "wager",
    question_id: question.id,
    wager,
    ends_at: new Date(Date.now() + Math.max(2, question.marks * 2) * 60_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function submitWagerAnswer(studentId: string, answerText: string) {
  const db = await admin();
  const { data: row } = await db
    .from("game_rounds")
    .select("id, class_id, question_id, wager, ends_at, finished_at, attempts")
    .eq("student_id", studentId)
    .eq("kind", "wager")
    .eq("day", today())
    .maybeSingle();
  if (!row) throw new Error("Place your wager first.");
  if (row.finished_at) throw new Error("Today's wager round is over.");
  if (new Date(row.ends_at).getTime() <= Date.now()) {
    await db.from("game_rounds").update({ finished_at: new Date().toISOString() }).eq("id", row.id);
    throw new Error("Time is up — your stake is lost.");
  }

  const result = await gradeGameAnswer(db, row.question_id!, row.class_id, answerText);
  const delta = result.correct ? row.wager : -row.wager;
  const awarded = await awardTokens(db, {
    classId: row.class_id,
    studentId,
    delta,
    reason: result.correct ? "Wager round won" : "Wager round lost",
    createdBy: null,
    capped: false,
  });

  const { data: question } = await db
    .from("questions")
    .select("mark_scheme")
    .eq("id", row.question_id!)
    .single();

  await db
    .from("game_rounds")
    .update({
      attempts: row.attempts + 1,
      answer_text: answerText,
      correct: result.correct,
      awarded,
      finished_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  return {
    correct: result.correct,
    awarded,
    feedback: result.feedback,
    markScheme: question?.mark_scheme ?? "",
    dailyCap: DAILY_TOKEN_CAP,
  };
}
