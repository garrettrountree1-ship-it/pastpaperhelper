/**
 * Shared server-only helpers for the token games (aliases, token awards,
 * question picking and pass/fail marking). Server-only: never imported from a
 * component.
 */
import { DAILY_TOKEN_CAP, uniqueAlias } from "./game-alias";

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type GameDb = Awaited<ReturnType<typeof admin>>;

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function signPaperPages(db: GameDb, paths: string[]) {
  if (paths.length === 0) return [];
  const { data } = await db.storage.from("paper-pages").createSignedUrls(paths, 60 * 60 * 8);
  return (data ?? []).map((item) => item.signedUrl).filter((url): url is string => Boolean(url));
}

export async function ensureProfile(db: GameDb, classId: string, studentId: string) {
  const { data: existing } = await db
    .from("game_profiles")
    .select("id, alias, tokens")
    .eq("class_id", classId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (existing) return existing;

  const { data: taken } = await db.from("game_profiles").select("alias").eq("class_id", classId);
  const alias = uniqueAlias(new Set((taken ?? []).map((row) => row.alias)));
  const { data: created, error } = await db
    .from("game_profiles")
    .insert({ class_id: classId, student_id: studentId, alias })
    .select("id, alias, tokens")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

export async function tokensEarnedToday(db: GameDb, studentId: string) {
  const { data } = await db
    .from("token_ledger")
    .select("delta, created_at, created_by")
    .eq("student_id", studentId)
    .gt("delta", 0)
    // Only game winnings count toward the daily cap — teacher adjustments don't.
    .is("created_by", null)
    .gte("created_at", `${today()}T00:00:00Z`);
  return (data ?? []).reduce((sum, row) => sum + row.delta, 0);
}


/** Awards (or deducts) tokens, respecting the daily cap when `capped`. */
export async function awardTokens(
  db: GameDb,
  input: {
    classId: string;
    studentId: string;
    delta: number;
    reason: string;
    createdBy: string | null;
    capped: boolean;
  },
) {
  let delta = input.delta;
  if (input.capped && delta > 0) {
    const already = await tokensEarnedToday(db, input.studentId);
    delta = Math.max(0, Math.min(delta, DAILY_TOKEN_CAP - already));
    if (delta === 0) return 0;
  }
  const profile = await ensureProfile(db, input.classId, input.studentId);
  await db
    .from("game_profiles")
    .update({ tokens: Math.max(0, profile.tokens + delta) })
    .eq("id", profile.id);
  await db.from("token_ledger").insert({
    class_id: input.classId,
    student_id: input.studentId,
    delta,
    reason: input.reason,
    created_by: input.createdBy,
  });
  return delta;
}

export type PickedQuestion = {
  id: string;
  question_text: string;
  mark_scheme: string;
  marks: number;
  image_paths: string[];
  assignment_id: string;
};

/** A published-homework question from the class, optionally filtered. */
export async function pickClassQuestion(
  db: GameDb,
  classId: string,
  options: { exclude?: Set<string>; minMarks?: number; preferHardest?: boolean } = {},
): Promise<PickedQuestion | null> {
  const { data: assignments } = await db
    .from("assignments")
    .select("id")
    .eq("class_id", classId)
    .eq("published", true);
  const assignmentIds = (assignments ?? []).map((a) => a.id);
  if (assignmentIds.length === 0) return null;

  const { data: questions } = await db
    .from("questions")
    .select("id, question_text, mark_scheme, marks, image_paths, assignment_id")
    .in("assignment_id", assignmentIds);

  let pool = (questions ?? []).filter((q) => !options.exclude || !options.exclude.has(q.id));
  if (options.minMarks) {
    const hard = pool.filter((q) => q.marks >= options.minMarks!);
    if (hard.length > 0) pool = hard;
  }
  if (pool.length === 0) return null;
  if (options.preferHardest) {
    const best = Math.max(...pool.map((q) => q.marks));
    pool = pool.filter((q) => q.marks === best);
  }
  return pool[Math.floor(Math.random() * pool.length)] as PickedQuestion;
}

/** Questions this student has already met in homework or a past game round. */
export async function seenQuestionIds(db: GameDb, studentId: string) {
  const seen = new Set<string>();
  const { data: rounds } = await db
    .from("game_rounds")
    .select("question_id")
    .eq("student_id", studentId);
  for (const row of rounds ?? []) if (row.question_id) seen.add(row.question_id);

  const { data: doubles } = await db
    .from("daily_doubles")
    .select("question_id")
    .eq("student_id", studentId);
  for (const row of doubles ?? []) seen.add(row.question_id);

  const { data: subs } = await db.from("submissions").select("id").eq("student_id", studentId);
  const submissionIds = (subs ?? []).map((s) => s.id);
  if (submissionIds.length > 0) {
    const { data: answers } = await db
      .from("answers")
      .select("question_id")
      .in("submission_id", submissionIds);
    for (const row of answers ?? []) seen.add(row.question_id);
  }
  return seen;
}

/** Games are pass/fail: full marks wins, and answers are never revealed. */
export async function gradeGameAnswer(
  db: GameDb,
  questionId: string,
  classId: string,
  answerText: string,
): Promise<{ correct: boolean; feedback: string }> {
  const { markStudentAnswer } = await import("./marking.server");
  const { data: question } = await db
    .from("questions")
    .select("id, question_text, mark_scheme, marks, image_paths")
    .eq("id", questionId)
    .single();
  if (!question) throw new Error("Question not found.");
  const { data: klass } = await db
    .from("classes")
    .select("curriculum, subject")
    .eq("id", classId)
    .single();

  const result = await markStudentAnswer({
    curriculum: klass?.curriculum ?? "IGCSE",
    subject: klass?.subject ?? "",
    question: question.question_text,
    markScheme: question.mark_scheme,
    marks: question.marks,
    answer: answerText,
    questionImageUrls: await signPaperPages(db, question.image_paths ?? []),
  });

  return {
    correct: result.verdict === "correct",
    feedback:
      result.verdict === "correct"
        ? "Correct — nice work!"
        : result.feedback || "Not fully correct yet.",
  };
}
