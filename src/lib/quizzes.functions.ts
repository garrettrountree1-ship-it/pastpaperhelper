import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type AnyDb = Awaited<ReturnType<typeof admin>>;

function decodeBase64(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signPaperPages(db: AnyDb, paths: string[]) {
  if (paths.length === 0) return [];
  const { data } = await db.storage.from("paper-pages").createSignedUrls(paths, 60 * 60 * 8);
  return (data ?? []).map((item) => item.signedUrl).filter((url): url is string => Boolean(url));
}

async function signWorkImages(db: AnyDb, paths: string[]) {
  if (paths.length === 0) return [];
  const { data } = await db.storage.from("student-work").createSignedUrls(paths, 3600);
  return (data ?? []).map((item) => item.signedUrl).filter((url): url is string => Boolean(url));
}

const questionInput = z.object({
  questionText: z.string().min(1),
  markScheme: z.string().min(1),
  marks: z.number().int().positive(),
  imagePaths: z.array(z.string()).default([]),
});

const settingsInput = {
  title: z.string().min(1),
  subject: z.string().default(""),
  instructions: z.string().default(""),
  timeLimitMinutes: z.number().int().min(1).max(300),
  revealMarkScheme: z.boolean().default(true),
  showScore: z.boolean().default(true),
};

/* ------------------------------------------------------------- teacher ---- */

export const listQuizzes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isTeacher) throw new Error("You do not teach this class.");

    const { data: quizzes, error } = await supabase
      .from("quizzes")
      .select(
        "id, title, subject, instructions, time_limit_minutes, reveal_mark_scheme, show_score, released_at, closed_at, created_at",
      )
      .eq("class_id", data.classId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (quizzes ?? []).map((q) => q.id);
    const [{ data: questions }, { data: attempts }] = await Promise.all([
      ids.length
        ? supabase.from("quiz_questions").select("quiz_id, marks").in("quiz_id", ids)
        : Promise.resolve({ data: [] as { quiz_id: string; marks: number }[] }),
      ids.length
        ? supabase.from("quiz_attempts").select("quiz_id, status").in("quiz_id", ids)
        : Promise.resolve({ data: [] as { quiz_id: string; status: string }[] }),
    ]);

    return (quizzes ?? []).map((q) => {
      const qs = (questions ?? []).filter((row) => row.quiz_id === q.id);
      const at = (attempts ?? []).filter((row) => row.quiz_id === q.id);
      return {
        id: q.id,
        title: q.title,
        subject: q.subject,
        instructions: q.instructions,
        timeLimitMinutes: q.time_limit_minutes,
        revealMarkScheme: q.reveal_mark_scheme,
        showScore: q.show_score,
        releasedAt: q.released_at,
        closedAt: q.closed_at,
        questionCount: qs.length,
        totalMarks: qs.reduce((sum, row) => sum + row.marks, 0),
        startedCount: at.length,
        submittedCount: at.filter((row) => row.status === "submitted").length,
      };
    });
  });

export const createQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        ...settingsInput,
        questions: z.array(questionInput).min(1),
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

    const { data: quiz, error } = await supabase
      .from("quizzes")
      .insert({
        class_id: data.classId,
        created_by: userId,
        title: data.title,
        subject: data.subject,
        instructions: data.instructions,
        time_limit_minutes: data.timeLimitMinutes,
        reveal_mark_scheme: data.revealMarkScheme,
        show_score: data.showScore,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: qError } = await supabase.from("quiz_questions").insert(
      data.questions.map((q, index) => ({
        quiz_id: quiz.id,
        position: index + 1,
        question_text: q.questionText,
        mark_scheme: q.markScheme,
        marks: q.marks,
        image_paths: q.imagePaths,
      })),
    );
    if (qError) throw new Error(qError.message);

    return { id: quiz.id };
  });

export const updateQuizSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ quizId: z.string().uuid(), ...settingsInput }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canTeach } = await supabase.rpc("can_teach_quiz", {
      _quiz_id: data.quizId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this quiz.");
    const { error } = await supabase
      .from("quizzes")
      .update({
        title: data.title,
        subject: data.subject,
        instructions: data.instructions,
        time_limit_minutes: data.timeLimitMinutes,
        reveal_mark_scheme: data.revealMarkScheme,
        show_score: data.showScore,
      })
      .eq("id", data.quizId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const releaseQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ quizId: z.string().uuid(), released: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canTeach } = await supabase.rpc("can_teach_quiz", {
      _quiz_id: data.quizId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this quiz.");
    const { error } = await supabase
      .from("quizzes")
      .update({
        released_at: data.released ? new Date().toISOString() : null,
        closed_at: null,
      })
      .eq("id", data.quizId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ quizId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canTeach } = await supabase.rpc("can_teach_quiz", {
      _quiz_id: data.quizId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this quiz.");
    const db = await admin();
    const { error } = await db.from("quizzes").delete().eq("id", data.quizId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Teacher ends the quiz for everyone: open attempts auto-submit and are marked. */
export const endQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ quizId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canTeach } = await supabase.rpc("can_teach_quiz", {
      _quiz_id: data.quizId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this quiz.");

    const db = await admin();
    await db.from("quizzes").update({ closed_at: new Date().toISOString() }).eq("id", data.quizId);
    const { data: open } = await db
      .from("quiz_attempts")
      .select("id")
      .eq("quiz_id", data.quizId)
      .eq("status", "in_progress");
    for (const attempt of open ?? []) {
      await gradeAttempt(db, attempt.id);
    }
    return { graded: (open ?? []).length };
  });

export const getQuizRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ quizId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canTeach } = await supabase.rpc("can_teach_quiz", {
      _quiz_id: data.quizId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this quiz.");

    const db = await admin();
    const { data: quiz } = await db
      .from("quizzes")
      .select("id, class_id, title, time_limit_minutes, released_at, closed_at")
      .eq("id", data.quizId)
      .single();
    if (!quiz) throw new Error("Quiz not found.");

    const [{ data: members }, { data: attempts }, { data: questions }] = await Promise.all([
      db.from("class_members").select("student_id").eq("class_id", quiz.class_id),
      db
        .from("quiz_attempts")
        .select("id, student_id, started_at, ends_at, submitted_at, status, awarded_marks, total_marks")
        .eq("quiz_id", data.quizId),
      db.from("quiz_questions").select("id, marks").eq("quiz_id", data.quizId),
    ]);

    const studentIds = (members ?? []).map((m) => m.student_id);
    const { data: profiles } = studentIds.length
      ? await db.from("profiles").select("id, full_name, email").in("id", studentIds)
      : { data: [] };
    const totalMarks = (questions ?? []).reduce((sum, q) => sum + q.marks, 0);

    return {
      quiz: {
        id: quiz.id,
        title: quiz.title,
        timeLimitMinutes: quiz.time_limit_minutes,
        releasedAt: quiz.released_at,
        closedAt: quiz.closed_at,
        totalMarks,
      },
      students: studentIds.map((id) => {
        const attempt = (attempts ?? []).find((a) => a.student_id === id);
        const profile = (profiles ?? []).find((p) => p.id === id);
        return {
          studentId: id,
          name: profile?.full_name || profile?.email || "Student",
          status: attempt ? attempt.status : "not_started",
          startedAt: attempt?.started_at ?? null,
          endsAt: attempt?.ends_at ?? null,
          submittedAt: attempt?.submitted_at ?? null,
          awardedMarks: attempt ? Number(attempt.awarded_marks) : 0,
          totalMarks: attempt?.total_marks || totalMarks,
        };
      }),
    };
  });

/* ------------------------------------------------------------- student ---- */

export const listStudentQuizzes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships } = await supabase
      .from("class_members")
      .select("class_id, classes(id, name, subject, curriculum)")
      .eq("student_id", userId);

    const classes = (memberships ?? [])
      .map((m) => m.classes)
      .filter((c): c is { id: string; name: string; subject: string; curriculum: string } =>
        Boolean(c),
      );
    const classIds = classes.map((c) => c.id);
    if (classIds.length === 0) return { classes: [], quizzes: [] };

    const { data: quizzes } = await supabase
      .from("quizzes")
      .select("id, class_id, title, subject, time_limit_minutes, released_at, closed_at, show_score")
      .in("class_id", classIds)
      .not("released_at", "is", null)
      .order("released_at", { ascending: false });

    const quizIds = (quizzes ?? []).map((q) => q.id);
    const [{ data: attempts }, { data: questions }] = await Promise.all([
      quizIds.length
        ? supabase
            .from("quiz_attempts")
            .select("quiz_id, status, awarded_marks, total_marks, ends_at")
            .in("quiz_id", quizIds)
            .eq("student_id", userId)
        : Promise.resolve({ data: [] as never[] }),
      quizIds.length
        ? supabase.from("quiz_questions").select("quiz_id, marks").in("quiz_id", quizIds)
        : Promise.resolve({ data: [] as { quiz_id: string; marks: number }[] }),
    ]);

    return {
      classes,
      quizzes: (quizzes ?? []).map((q) => {
        const attempt = (attempts ?? []).find((a) => a.quiz_id === q.id);
        return {
          id: q.id,
          classId: q.class_id,
          title: q.title,
          subject: q.subject,
          timeLimitMinutes: q.time_limit_minutes,
          closed: Boolean(q.closed_at),
          showScore: q.show_score,
          totalMarks: (questions ?? [])
            .filter((row) => row.quiz_id === q.id)
            .reduce((sum, row) => sum + row.marks, 0),
          status: attempt?.status ?? "not_started",
          awardedMarks: attempt ? Number(attempt.awarded_marks) : null,
        };
      }),
    };
  });

/**
 * Student workspace. Starts the attempt (and its countdown) the first time the
 * quiz is opened. No marking, tutoring or feedback is returned until the quiz
 * has been submitted.
 */
export const getQuizWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ quizId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canStudy } = await supabase.rpc("can_study_quiz", {
      _quiz_id: data.quizId,
      _user_id: userId,
    });
    if (!canStudy) throw new Error("This quiz has not been released yet.");

    const db = await admin();
    const { data: quiz, error } = await db
      .from("quizzes")
      .select(
        "id, class_id, title, subject, instructions, time_limit_minutes, reveal_mark_scheme, show_score, released_at, closed_at",
      )
      .eq("id", data.quizId)
      .single();
    if (error || !quiz) throw new Error("Quiz not found.");

    let { data: attempt } = await db
      .from("quiz_attempts")
      .select("id, started_at, ends_at, submitted_at, status, awarded_marks, total_marks")
      .eq("quiz_id", data.quizId)
      .eq("student_id", userId)
      .maybeSingle();

    const { data: questions } = await db
      .from("quiz_questions")
      .select("id, position, question_text, mark_scheme, marks, image_paths")
      .eq("quiz_id", data.quizId)
      .order("position");
    const totalMarks = (questions ?? []).reduce((sum, q) => sum + q.marks, 0);

    if (!attempt) {
      if (quiz.closed_at) throw new Error("This quiz is closed.");
      const endsAt = new Date(Date.now() + quiz.time_limit_minutes * 60_000).toISOString();
      const { data: created, error: cError } = await db
        .from("quiz_attempts")
        .insert({
          quiz_id: data.quizId,
          student_id: userId,
          ends_at: endsAt,
          total_marks: totalMarks,
        })
        .select("id, started_at, ends_at, submitted_at, status, awarded_marks, total_marks")
        .single();
      if (cError) throw new Error(cError.message);
      attempt = created;
    }

    // Timer expired while the tab was closed — mark it now.
    if (attempt.status === "in_progress" && new Date(attempt.ends_at).getTime() <= Date.now()) {
      await gradeAttempt(db, attempt.id);
      const { data: refreshed } = await db
        .from("quiz_attempts")
        .select("id, started_at, ends_at, submitted_at, status, awarded_marks, total_marks")
        .eq("id", attempt.id)
        .single();
      if (refreshed) attempt = refreshed;
    }

    const finished = attempt.status === "submitted";
    const { data: answers } = await db
      .from("quiz_answers")
      .select("question_id, answer_text, image_paths, awarded_marks, verdict, feedback, mark_breakdown")
      .eq("attempt_id", attempt.id);

    return {
      quiz: {
        id: quiz.id,
        classId: quiz.class_id,
        title: quiz.title,
        subject: quiz.subject,
        instructions: quiz.instructions,
        timeLimitMinutes: quiz.time_limit_minutes,
        closed: Boolean(quiz.closed_at),
        revealMarkScheme: quiz.reveal_mark_scheme,
        showScore: quiz.show_score,
      },
      attempt: {
        id: attempt.id,
        endsAt: attempt.ends_at,
        submittedAt: attempt.submitted_at,
        status: attempt.status,
        awardedMarks: Number(attempt.awarded_marks),
        totalMarks: attempt.total_marks || totalMarks,
        secondsLeft: Math.max(
          0,
          Math.round((new Date(attempt.ends_at).getTime() - Date.now()) / 1000),
        ),
      },
      questions: await Promise.all(
        (questions ?? []).map(async (q) => {
          const answer = (answers ?? []).find((a) => a.question_id === q.id);
          return {
            id: q.id,
            position: q.position,
            questionText: q.question_text,
            marks: q.marks,
            imageUrls: await signPaperPages(db, q.image_paths ?? []),
            markScheme: finished && quiz.reveal_mark_scheme ? q.mark_scheme : null,
            answerText: answer?.answer_text ?? "",
            answerImageUrls: await signWorkImages(db, answer?.image_paths ?? []),
            result:
              finished && quiz.show_score && answer
                ? {
                    awardedMarks: Number(answer.awarded_marks),
                    verdict: answer.verdict,
                    feedback: answer.feedback,
                  }
                : null,
          };
        }),
      ),
    };
  });

export const saveQuizAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        quizId: z.string().uuid(),
        questionId: z.string().uuid(),
        answerText: z.string().default(""),
        images: z
          .array(z.object({ mimeType: z.string(), base64: z.string().min(1) }))
          .max(4)
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!isEnglishOnly(data.answerText)) throw new Error(ENGLISH_ONLY_MESSAGE);
    const { data: canStudy } = await supabase.rpc("can_study_quiz", {
      _quiz_id: data.quizId,
      _user_id: userId,
    });
    if (!canStudy) throw new Error("This quiz is not available.");

    const db = await admin();
    const { data: attempt } = await db
      .from("quiz_attempts")
      .select("id, ends_at, status")
      .eq("quiz_id", data.quizId)
      .eq("student_id", userId)
      .maybeSingle();
    if (!attempt) throw new Error("Open the quiz first.");
    if (attempt.status !== "in_progress") throw new Error("Your quiz has already been submitted.");
    if (new Date(attempt.ends_at).getTime() <= Date.now()) {
      await gradeAttempt(db, attempt.id);
      throw new Error("Time is up — your quiz has been submitted.");
    }

    const { data: existing } = await db
      .from("quiz_answers")
      .select("id, image_paths")
      .eq("attempt_id", attempt.id)
      .eq("question_id", data.questionId)
      .maybeSingle();

    const paths = [...(existing?.image_paths ?? [])];
    for (const [index, image] of data.images.entries()) {
      const path = `quiz/${attempt.id}/${data.questionId}-${Date.now()}-${index}.jpg`;
      const { error } = await db.storage
        .from("student-work")
        .upload(path, decodeBase64(image.base64), {
          contentType: image.mimeType || "image/jpeg",
          upsert: true,
        });
      if (!error) paths.push(path);
    }

    const payload = {
      attempt_id: attempt.id,
      question_id: data.questionId,
      answer_text: data.answerText,
      image_paths: paths,
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      const { error } = await db.from("quiz_answers").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("quiz_answers").insert(payload);
      if (error) throw new Error(error.message);
    }

    return { ok: true, imageUrls: await signWorkImages(db, paths) };
  });

export const submitQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ quizId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canStudy } = await supabase.rpc("can_study_quiz", {
      _quiz_id: data.quizId,
      _user_id: userId,
    });
    if (!canStudy) throw new Error("This quiz is not available.");

    const db = await admin();
    const { data: attempt } = await db
      .from("quiz_attempts")
      .select("id, status")
      .eq("quiz_id", data.quizId)
      .eq("student_id", userId)
      .maybeSingle();
    if (!attempt) throw new Error("Open the quiz first.");
    if (attempt.status === "submitted") return { ok: true };
    await gradeAttempt(db, attempt.id);
    return { ok: true };
  });

/**
 * Marks every answer of an attempt in one pass and closes it. Quizzes are graded
 * only here — never while the student is still working.
 */
async function gradeAttempt(db: AnyDb, attemptId: string) {
  const { markStudentAnswer } = await import("./marking.server");

  const { data: attempt } = await db
    .from("quiz_attempts")
    .select("id, quiz_id, status")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.status === "submitted") return;

  const { data: quiz } = await db
    .from("quizzes")
    .select("id, subject, class_id, classes(curriculum)")
    .eq("id", attempt.quiz_id)
    .single();
  const { data: questions } = await db
    .from("quiz_questions")
    .select("id, question_text, mark_scheme, marks, image_paths")
    .eq("quiz_id", attempt.quiz_id)
    .order("position");
  const { data: answers } = await db
    .from("quiz_answers")
    .select("id, question_id, answer_text, image_paths")
    .eq("attempt_id", attemptId);

  let awardedTotal = 0;
  const totalMarks = (questions ?? []).reduce((sum, q) => sum + q.marks, 0);

  for (const question of questions ?? []) {
    const answer = (answers ?? []).find((a) => a.question_id === question.id);
    if (!answer || (!answer.answer_text.trim() && (answer.image_paths ?? []).length === 0)) {
      if (answer) {
        await db
          .from("quiz_answers")
          .update({ awarded_marks: 0, verdict: "incorrect", feedback: "No answer given." })
          .eq("id", answer.id);
      }
      continue;
    }

    try {
      const result = await markStudentAnswer({
        curriculum:
          (quiz as { classes?: { curriculum?: string } | null })?.classes?.curriculum ?? "IGCSE",
        subject: quiz?.subject ?? "",
        question: question.question_text,
        markScheme: question.mark_scheme,
        marks: question.marks,
        answer: answer.answer_text,
        imageUrls: await signWorkImages(db, answer.image_paths ?? []),
        questionImageUrls: await signPaperPages(db, question.image_paths ?? []),
      });
      awardedTotal += result.awardedMarks;
      await db
        .from("quiz_answers")
        .update({
          awarded_marks: result.awardedMarks,
          verdict: result.verdict,
          feedback: result.feedback,
          mark_breakdown: result.markPoints,
        })
        .eq("id", answer.id);
    } catch {
      await db
        .from("quiz_answers")
        .update({ verdict: "unmarked", feedback: "Could not be marked automatically." })
        .eq("id", answer.id);
    }
  }

  await db
    .from("quiz_attempts")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      awarded_marks: awardedTotal,
      total_marks: totalMarks,
    })
    .eq("id", attemptId);
}
