import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DAILY_TOKEN_CAP, uniqueAlias } from "@/lib/game-alias";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type AnyDb = Awaited<ReturnType<typeof admin>>;

async function signPaperPages(db: AnyDb, paths: string[]) {
  if (paths.length === 0) return [];
  const { data } = await db.storage.from("paper-pages").createSignedUrls(paths, 60 * 60 * 8);
  return (data ?? []).map((item) => item.signedUrl).filter((url): url is string => Boolean(url));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Creates the student's permanent class alias the first time they play. */
async function ensureProfile(db: AnyDb, classId: string, studentId: string) {
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

async function tokensEarnedToday(db: AnyDb, studentId: string) {
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


/** Awards (or deducts) tokens, respecting the 3-token daily cap on game wins. */
async function awardTokens(
  db: AnyDb,
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

async function randomClassQuestion(db: AnyDb, classId: string, exclude?: Set<string>) {
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
  const pool = (questions ?? []).filter((q) => !exclude || !exclude.has(q.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Homework average per student, used to pair students of similar ability. */
async function classAverages(db: AnyDb, classId: string) {
  const { data: assignments } = await db.from("assignments").select("id").eq("class_id", classId);
  const ids = (assignments ?? []).map((a) => a.id);
  if (ids.length === 0) return new Map<string, number>();
  const { data: subs } = await db
    .from("submissions")
    .select("student_id, awarded_marks, total_marks")
    .in("assignment_id", ids);
  const totals = new Map<string, { awarded: number; total: number }>();
  for (const row of subs ?? []) {
    const current = totals.get(row.student_id) ?? { awarded: 0, total: 0 };
    current.awarded += Number(row.awarded_marks);
    current.total += row.total_marks;
    totals.set(row.student_id, current);
  }
  const averages = new Map<string, number>();
  for (const [studentId, value] of totals) {
    averages.set(studentId, value.total > 0 ? (value.awarded / value.total) * 100 : 0);
  }
  return averages;
}

/** Decides a match once both students are done or the match has expired. */
async function resolveMatch(db: AnyDb, matchId: string) {
  const { data: match } = await db
    .from("game_matches")
    .select("id, class_id, expires_at, winner_id, resolved_at, student_a, student_b")
    .eq("id", matchId)
    .maybeSingle();
  if (!match || match.resolved_at) return;

  const { data: attempts } = await db
    .from("game_attempts")
    .select("student_id, correct, seconds, finished_at")
    .eq("match_id", matchId);
  const expired = new Date(match.expires_at).getTime() <= Date.now();
  const finished = (attempts ?? []).filter((a) => a.finished_at);
  const bothDone = finished.length === 2;
  if (!expired && !bothDone) return;

  const correct = finished
    .filter((a) => a.correct)
    .sort((a, b) => Number(a.seconds ?? 1e9) - Number(b.seconds ?? 1e9));
  const winner = correct[0]?.student_id ?? null;

  await db
    .from("game_matches")
    .update({ resolved_at: new Date().toISOString(), winner_id: winner })
    .eq("id", matchId);

  if (winner) {
    await awardTokens(db, {
      classId: match.class_id,
      studentId: winner,
      delta: 1,
      reason: "Won a head-to-head challenge",
      createdBy: null,
      capped: true,
    });
  }
}

/* ------------------------------------------------------------- shared ----- */

export const getGamesOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const db = await admin();

    const [{ data: taught }, { data: memberships }, { data: authUser }] = await Promise.all([
      supabase.from("classes").select("id, name, subject").eq("teacher_id", userId),
      supabase
        .from("class_members")
        .select("class_id, classes(id, name, subject)")
        .eq("student_id", userId),
      supabase.auth.getUser(),
    ]);

    const studentClasses = (memberships ?? [])
      .map((m) => m.classes)
      .filter((c): c is { id: string; name: string; subject: string } => Boolean(c));

    // The shared demo account can flip to the student view, so its own classes
    // must also be playable as a student.
    const { isDemoEmail } = await import("@/lib/demo");
    if (isDemoEmail(authUser.user?.email)) {
      for (const klass of taught ?? []) {
        if (!studentClasses.some((c) => c.id === klass.id)) studentClasses.push(klass);
        await ensureProfile(db, klass.id, userId);
      }
    }


    // Aliases exist for every member so the leaderboard is complete.
    for (const klass of [...(taught ?? []), ...studentClasses]) {
      const { data: members } = await db
        .from("class_members")
        .select("student_id")
        .eq("class_id", klass.id);
      for (const member of members ?? []) {
        await ensureProfile(db, klass.id, member.student_id);
      }
    }

    const classIds = [...(taught ?? []).map((c) => c.id), ...studentClasses.map((c) => c.id)];
    const { data: profiles } = classIds.length
      ? await db
          .from("game_profiles")
          .select("class_id, student_id, alias, tokens")
          .in("class_id", classIds)
          .order("tokens", { ascending: false })
      : { data: [] };

    // Lazily resolve any of my matches that are now decided.
    const { data: myMatches } = await db
      .from("game_matches")
      .select("id, class_id, question_id, expires_at, winner_id, resolved_at, student_a, student_b")
      .or(`student_a.eq.${userId},student_b.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(20);
    for (const match of myMatches ?? []) {
      if (!match.resolved_at) await resolveMatch(db, match.id);
    }
    const { data: matches } = await db
      .from("game_matches")
      .select("id, class_id, question_id, expires_at, winner_id, resolved_at, student_a, student_b")
      .or(`student_a.eq.${userId},student_b.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(20);
    const { data: myAttempts } = await db
      .from("game_attempts")
      .select("match_id, correct, finished_at, attempts")
      .eq("student_id", userId);

    const aliasFor = (classId: string, studentId: string) =>
      (profiles ?? []).find((p) => p.class_id === classId && p.student_id === studentId)?.alias ??
      "Classmate";

    const dailyDouble = await db
      .from("daily_doubles")
      .select("id, class_id, day, correct, awarded, finished_at, ends_at")
      .eq("student_id", userId)
      .eq("day", today())
      .maybeSingle();

    return {
      teacherClasses: (taught ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        leaderboard: [
          ...(profiles ?? [])
            .filter((p) => p.class_id === c.id)
            .map((p) => ({
              studentId: p.student_id,
              alias: p.alias,
              tokens: p.tokens,
              demo: false,
            })),
        ].sort((a, b) => b.tokens - a.tokens),
      })),
      studentClasses: studentClasses.map((c) => {
        const mine = (profiles ?? []).find((p) => p.class_id === c.id && p.student_id === userId);
        return {
          id: c.id,
          name: c.name,
          subject: c.subject,
          alias: mine?.alias ?? "",
          tokens: mine?.tokens ?? 0,
          leaderboard: [
            ...(profiles ?? [])
              .filter((p) => p.class_id === c.id)
              .map((p) => ({
                alias: p.alias,
                tokens: p.tokens,
                isYou: p.student_id === userId,
                demo: false,
              })),
          ].sort((a, b) => b.tokens - a.tokens),
        };
      }),
      matches: (matches ?? []).map((m) => {
        const attempt = (myAttempts ?? []).find((a) => a.match_id === m.id);
        const opponent = m.student_a === userId ? m.student_b : m.student_a;
        return {
          id: m.id,
          classId: m.class_id,
          opponentAlias: aliasFor(m.class_id, opponent),
          expiresAt: m.expires_at,
          resolved: Boolean(m.resolved_at),
          won: m.winner_id === userId,
          winnerAlias: m.winner_id ? aliasFor(m.class_id, m.winner_id) : null,
          myAttemptDone: Boolean(attempt?.finished_at),
          myAttemptCorrect: Boolean(attempt?.correct),
        };
      }),
      dailyDouble: dailyDouble.data
        ? {
            available: !dailyDouble.data.finished_at,
            done: Boolean(dailyDouble.data.finished_at),
            correct: dailyDouble.data.correct,
            awarded: dailyDouble.data.awarded,
          }
        : { available: true, done: false, correct: false, awarded: 0 },
      tokensToday: await tokensEarnedToday(db, userId),
      dailyCap: DAILY_TOKEN_CAP,
      disabledGames: await (async () => {
        const { disabledGamesFor } = await import("./game-admin.server");
        return disabledGamesFor(classIds);
      })(),
    };
  });

/* ------------------------------------------------------------ teacher ----- */

export const pairClassRandomly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ classId: z.string().uuid(), mode: z.enum(["random", "similar"]).default("random") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isTeacher) throw new Error("You do not teach this class.");

    const db = await admin();
    const { data: members } = await db
      .from("class_members")
      .select("student_id")
      .eq("class_id", data.classId);
    let ids = (members ?? []).map((m) => m.student_id);
    if (ids.length < 2) throw new Error("You need at least two students in the class.");

    if (data.mode === "similar") {
      const averages = await classAverages(db, data.classId);
      ids = ids.sort((a, b) => (averages.get(b) ?? 0) - (averages.get(a) ?? 0));
    } else {
      ids = ids.sort(() => Math.random() - 0.5);
    }

    let created = 0;
    for (let i = 0; i + 1 < ids.length; i += 2) {
      const question = await randomClassQuestion(db, data.classId);
      if (!question) throw new Error("Publish some homework first — questions come from past work.");
      const studentA = ids[i]!;
      const studentB = ids[i + 1]!;
      const { data: match, error } = await db
        .from("game_matches")
        .insert({
          class_id: data.classId,
          question_id: question.id,
          created_by: userId,
          student_a: studentA,
          student_b: studentB,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await ensureProfile(db, data.classId, studentA);
      await ensureProfile(db, data.classId, studentB);
      created += 1;
      void match;
    }
    return { created };
  });

export const resetLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isTeacher) throw new Error("You do not teach this class.");
    const db = await admin();
    const { data: profiles } = await db
      .from("game_profiles")
      .select("student_id, tokens")
      .eq("class_id", data.classId);
    for (const profile of profiles ?? []) {
      if (profile.tokens === 0) continue;
      await db.from("token_ledger").insert({
        class_id: data.classId,
        student_id: profile.student_id,
        delta: -profile.tokens,
        reason: "Leaderboard reset by teacher",
        created_by: userId,
      });
    }
    await db.from("game_profiles").update({ tokens: 0 }).eq("class_id", data.classId);
    return { ok: true };
  });

export const adjustTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        studentId: z.string().uuid(),
        delta: z.number().int().min(-50).max(50),
        reason: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isTeacher) throw new Error("You do not teach this class.");
    if (data.delta === 0) throw new Error("Choose a token amount.");
    const db = await admin();
    const applied = await awardTokens(db, {
      classId: data.classId,
      studentId: data.studentId,
      delta: data.delta,
      reason: data.reason,
      createdBy: userId,
      capped: false,
    });

    // Always tell the student why their token total changed.
    await db.from("class_messages").insert({
      class_id: data.classId,
      student_id: data.studentId,
      sender_id: userId,
      sender_role: "teacher",
      topic: "Tokens updated",
      body: `${applied > 0 ? `+${applied}` : applied} token${Math.abs(applied) === 1 ? "" : "s"}: ${data.reason}`,
    });

    return { ok: true, applied };
  });

export const getTokenHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    const db = await admin();
    const query = db
      .from("token_ledger")
      .select("id, student_id, delta, reason, created_at")
      .eq("class_id", data.classId)
      .order("created_at", { ascending: false })
      .limit(60);
    const { data: rows } = isTeacher ? await query : await query.eq("student_id", userId);
    const { data: profiles } = await db
      .from("game_profiles")
      .select("student_id, alias")
      .eq("class_id", data.classId);
    return (rows ?? []).map((row) => ({
      id: row.id,
      alias:
        (profiles ?? []).find((p) => p.student_id === row.student_id)?.alias ?? "Student",
      delta: row.delta,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  });

/* -------------------------------------------------- head-to-head match ---- */

/** A student asks the platform for an opponent of similar homework average. */
export const requestMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isMember } = await supabase.rpc("is_class_member", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isMember) throw new Error("You are not in this class.");

    const { assertGameEnabled } = await import("./game-admin.server");
    await assertGameEnabled(data.classId, "head_to_head");

    const db = await admin();
    const { data: members } = await db
      .from("class_members")
      .select("student_id")
      .eq("class_id", data.classId);
    const others = (members ?? []).map((m) => m.student_id).filter((id) => id !== userId);
    if (others.length === 0) throw new Error("No classmates to play against yet.");

    const averages = await classAverages(db, data.classId);
    const mine = averages.get(userId) ?? 0;
    const opponent = others.sort(
      (a, b) =>
        Math.abs((averages.get(a) ?? 0) - mine) - Math.abs((averages.get(b) ?? 0) - mine),
    )[0]!;

    const question = await randomClassQuestion(db, data.classId);
    if (!question) throw new Error("No past homework questions in this class yet.");

    const { data: match, error } = await db
      .from("game_matches")
      .insert({
        class_id: data.classId,
        question_id: question.id,
        created_by: userId,
        student_a: userId,
        student_b: opponent,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await ensureProfile(db, data.classId, userId);
    await ensureProfile(db, data.classId, opponent);
    return { matchId: match.id };
  });

export const getMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ matchId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const db = await admin();
    await resolveMatch(db, data.matchId);

    const { data: match } = await db
      .from("game_matches")
      .select(
        "id, class_id, question_id, expires_at, winner_id, resolved_at, student_a, student_b",
      )
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) throw new Error("Challenge not found.");
    if (match.student_a !== userId && match.student_b !== userId) {
      throw new Error("This challenge is not yours.");
    }

    const { data: question } = await db
      .from("questions")
      .select("id, question_text, marks, image_paths")
      .eq("id", match.question_id)
      .single();

    let { data: attempt } = await db
      .from("game_attempts")
      .select("id, attempts, correct, finished_at, ends_at, answer_text")
      .eq("match_id", data.matchId)
      .eq("student_id", userId)
      .maybeSingle();

    if (!attempt && !match.resolved_at) {
      const { data: created } = await db
        .from("game_attempts")
        .insert({
          match_id: data.matchId,
          student_id: userId,
          ends_at: new Date(Date.now() + (question?.marks ?? 1) * 60_000).toISOString(),
        })
        .select("id, attempts, correct, finished_at, ends_at, answer_text")
        .single();
      attempt = created;
    }

    const opponentId = match.student_a === userId ? match.student_b : match.student_a;
    const { data: profiles } = await db
      .from("game_profiles")
      .select("student_id, alias")
      .eq("class_id", match.class_id);

    return {
      id: match.id,
      classId: match.class_id,
      questionText: question?.question_text ?? "",
      marks: question?.marks ?? 1,
      imageUrls: await signPaperPages(db, question?.image_paths ?? []),
      opponentAlias:
        (profiles ?? []).find((p) => p.student_id === opponentId)?.alias ?? "Classmate",
      expiresAt: match.expires_at,
      resolved: Boolean(match.resolved_at),
      won: match.winner_id === userId,
      winnerAlias: match.winner_id
        ? ((profiles ?? []).find((p) => p.student_id === match.winner_id)?.alias ?? "Classmate")
        : null,
      attempt: attempt
        ? {
            attempts: attempt.attempts,
            correct: attempt.correct,
            done: Boolean(attempt.finished_at),
            answerText: attempt.answer_text,
            secondsLeft: Math.max(
              0,
              Math.round((new Date(attempt.ends_at).getTime() - Date.now()) / 1000),
            ),
          }
        : null,
    };
  });

export const submitMatchAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ matchId: z.string().uuid(), answerText: z.string().min(1) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (!isEnglishOnly(data.answerText)) throw new Error(ENGLISH_ONLY_MESSAGE);
    const db = await admin();

    const { data: match } = await db
      .from("game_matches")
      .select("id, class_id, question_id, resolved_at, student_a, student_b")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) throw new Error("Challenge not found.");
    if (match.student_a !== userId && match.student_b !== userId) throw new Error("Not your challenge.");
    if (match.resolved_at) throw new Error("This challenge is over.");

    const { data: attempt } = await db
      .from("game_attempts")
      .select("id, attempts, started_at, ends_at, finished_at")
      .eq("match_id", data.matchId)
      .eq("student_id", userId)
      .maybeSingle();
    if (!attempt) throw new Error("Open the challenge first.");
    if (attempt.finished_at) throw new Error("You have already finished this challenge.");
    if (new Date(attempt.ends_at).getTime() <= Date.now()) {
      await db
        .from("game_attempts")
        .update({ finished_at: new Date().toISOString() })
        .eq("id", attempt.id);
      await resolveMatch(db, data.matchId);
      throw new Error("Your time is up on this challenge.");
    }

    const result = await gradeGameAnswer(db, match.question_id, match.class_id, data.answerText);
    const seconds = (Date.now() - new Date(attempt.started_at).getTime()) / 1000;

    await db
      .from("game_attempts")
      .update({
        attempts: attempt.attempts + 1,
        answer_text: data.answerText,
        correct: result.correct,
        seconds: result.correct ? seconds : null,
        finished_at: result.correct ? new Date().toISOString() : null,
      })
      .eq("id", attempt.id);

    if (result.correct) await resolveMatch(db, data.matchId);
    return { correct: result.correct, feedback: result.feedback };
  });

/* ---------------------------------------------------------- daily double -- */

export const startDailyDouble = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const db = await admin();

    const { data: existing } = await db
      .from("daily_doubles")
      .select("id, class_id, question_id, ends_at, attempts, correct, finished_at")
      .eq("student_id", userId)
      .eq("day", today())
      .maybeSingle();

    let row = existing;
    if (!row) {
      const { data: memberships } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("student_id", userId);
      const { disabledGamesFor } = await import("./game-admin.server");
      const allClassIds = (memberships ?? []).map((m) => m.class_id);
      const disabled = await disabledGamesFor(allClassIds);
      const classIds = allClassIds
        .filter((id) => !(disabled[id] ?? []).includes("daily_double"))
        .sort(() => Math.random() - 0.5);
      if (classIds.length === 0) {
        throw new Error("The daily double is not available in your classes right now.");
      }

      // Never repeat a daily double, and prefer questions this student has not met in homework.
      const { data: pastDoubles } = await db
        .from("daily_doubles")
        .select("question_id")
        .eq("student_id", userId);
      const usedBefore = new Set((pastDoubles ?? []).map((d) => d.question_id));

      const { data: mySubs } = await db
        .from("submissions")
        .select("id")
        .eq("student_id", userId);
      const submissionIds = (mySubs ?? []).map((s) => s.id);
      const { data: myAnswers } = submissionIds.length
        ? await db.from("answers").select("question_id").in("submission_id", submissionIds)
        : { data: [] as { question_id: string }[] };
      const seenInHomework = new Set([
        ...usedBefore,
        ...(myAnswers ?? []).map((a) => a.question_id),
      ]);

      let picked: { classId: string; questionId: string; marks: number } | null = null;
      for (const exclude of [seenInHomework, usedBefore]) {
        for (const classId of classIds) {
          const question = await randomClassQuestion(db, classId, exclude);
          if (question) {
            picked = { classId, questionId: question.id, marks: question.marks };
            break;
          }
        }
        if (picked) break;
      }
      if (!picked) throw new Error("No new homework questions available for a daily double yet.");
      const { data: created, error } = await db
        .from("daily_doubles")
        .insert({
          class_id: picked.classId,
          student_id: userId,
          question_id: picked.questionId,
          ends_at: new Date(Date.now() + picked.marks * 60_000).toISOString(),
        })
        .select("id, class_id, question_id, ends_at, attempts, correct, finished_at")
        .single();
      if (error) throw new Error(error.message);
      row = created;
    }

    const { data: question } = await db
      .from("questions")
      .select("id, question_text, mark_scheme, marks, image_paths")
      .eq("id", row.question_id)
      .single();

    const expired = new Date(row.ends_at).getTime() <= Date.now();
    if (expired && !row.finished_at) {
      await db
        .from("daily_doubles")
        .update({ finished_at: new Date().toISOString() })
        .eq("id", row.id);
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
      // The round is over, so showing the mark scheme is teaching, not cheating.
      markScheme: over ? (question?.mark_scheme ?? "") : null,
      secondsLeft: Math.max(0, Math.round((new Date(row.ends_at).getTime() - Date.now()) / 1000)),
    };
  });

export const submitDailyDouble = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ answerText: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (!isEnglishOnly(data.answerText)) throw new Error(ENGLISH_ONLY_MESSAGE);
    const db = await admin();

    const { data: row } = await db
      .from("daily_doubles")
      .select("id, class_id, question_id, ends_at, attempts, finished_at")
      .eq("student_id", userId)
      .eq("day", today())
      .maybeSingle();
    if (!row) throw new Error("Open today's daily double first.");
    if (row.finished_at) throw new Error("Today's daily double is already finished.");
    if (new Date(row.ends_at).getTime() <= Date.now()) {
      await db
        .from("daily_doubles")
        .update({ finished_at: new Date().toISOString() })
        .eq("id", row.id);
      throw new Error("Time is up — try again tomorrow.");
    }

    const result = await gradeGameAnswer(db, row.question_id, row.class_id, data.answerText);
    if (!result.correct) {
      await db
        .from("daily_doubles")
        .update({ attempts: row.attempts + 1, answer_text: data.answerText })
        .eq("id", row.id);
      return { correct: false, awarded: 0, feedback: result.feedback, markScheme: null };
    }

    const awarded = await awardTokens(db, {
      classId: row.class_id,
      studentId: userId,
      delta: 2,
      reason: "Daily double",
      createdBy: null,
      capped: true,
    });
    await db
      .from("daily_doubles")
      .update({
        attempts: row.attempts + 1,
        answer_text: data.answerText,
        correct: true,
        awarded,
        finished_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    const { data: question } = await db
      .from("questions")
      .select("mark_scheme")
      .eq("id", row.question_id)
      .single();
    return {
      correct: true,
      awarded,
      feedback: result.feedback,
      markScheme: question?.mark_scheme ?? "",
    };
  });

/** Games are pass/fail only: full marks wins, and no answers are ever revealed. */
async function gradeGameAnswer(
  db: AnyDb,
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
    feedback: result.verdict === "correct" ? "Correct — nice work!" : "Not fully correct yet.",
  };
}
