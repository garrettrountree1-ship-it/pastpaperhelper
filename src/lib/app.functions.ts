import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function makeJoinCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/* ------------------------------------------------------------------ me ---- */

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const role = roles?.some((r) => r.role === "teacher") ? "teacher" : "student";
    return {
      id: userId,
      fullName: profile?.full_name ?? "",
      email: profile?.email ?? "",
      role: role as "teacher" | "student",
    };
  });

/* --------------------------------------------------------------- teacher --- */

export const listTeacherClasses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: classes, error } = await supabase
      .from("classes")
      .select("id, name, curriculum, subject, join_code, created_at")
      .eq("teacher_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (classes ?? []).map((c) => c.id);
    if (ids.length === 0) return [];

    const [{ data: members }, { data: assignments }] = await Promise.all([
      supabase.from("class_members").select("class_id").in("class_id", ids),
      supabase.from("assignments").select("class_id").in("class_id", ids),
    ]);

    return (classes ?? []).map((c) => ({
      ...c,
      studentCount: (members ?? []).filter((m) => m.class_id === c.id).length,
      assignmentCount: (assignments ?? []).filter((a) => a.class_id === c.id).length,
    }));
  });

export const createClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ name: z.string().min(1), curriculum: z.string().min(1), subject: z.string() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "teacher",
    });
    if (!isTeacher) throw new Error("Only teachers can create classes.");

    let lastError = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: created, error } = await supabase
        .from("classes")
        .insert({
          teacher_id: userId,
          name: data.name,
          curriculum: data.curriculum,
          subject: data.subject,
          join_code: makeJoinCode(),
        })
        .select("id, name, join_code")
        .single();
      if (!error) return created;
      lastError = error.message;
    }
    throw new Error(lastError || "Could not create class.");
  });

export const createAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        title: z.string().min(1),
        subject: z.string(),
        instructions: z.string(),
        dueAt: z.string().nullable(),
        questions: z.array(
          z.object({
            questionText: z.string().min(1),
            markScheme: z.string().min(1),
            marks: z.number().int().positive(),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.questions.length === 0) throw new Error("Add at least one question.");

    const { data: klass, error: classError } = await supabase
      .from("classes")
      .select("id, teacher_id")
      .eq("id", data.classId)
      .maybeSingle();
    if (classError) throw new Error(classError.message);
    if (!klass || klass.teacher_id !== userId) throw new Error("You do not own this class.");

    const { data: assignment, error } = await supabase
      .from("assignments")
      .insert({
        class_id: data.classId,
        created_by: userId,
        title: data.title,
        subject: data.subject,
        instructions: data.instructions,
        due_at: data.dueAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: qError } = await supabase.from("questions").insert(
      data.questions.map((q, index) => ({
        assignment_id: assignment.id,
        position: index + 1,
        question_text: q.questionText,
        mark_scheme: q.markScheme,
        marks: q.marks,
      })),
    );
    if (qError) throw new Error(qError.message);

    return { id: assignment.id };
  });

export const getClassOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: klass, error } = await supabase
      .from("classes")
      .select("id, name, curriculum, subject, join_code, teacher_id")
      .eq("id", data.classId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!klass || klass.teacher_id !== userId) throw new Error("Class not found.");

    const db = await admin();

    const [{ data: members }, { data: assignments }] = await Promise.all([
      db.from("class_members").select("student_id, joined_at").eq("class_id", data.classId),
      db
        .from("assignments")
        .select("id, title, subject, due_at, created_at")
        .eq("class_id", data.classId)
        .order("created_at", { ascending: false }),
    ]);

    const studentIds = (members ?? []).map((m) => m.student_id);
    const assignmentIds = (assignments ?? []).map((a) => a.id);

    const { data: profiles } = studentIds.length
      ? await db.from("profiles").select("id, full_name, email").in("id", studentIds)
      : { data: [] };

    const { data: questions } = assignmentIds.length
      ? await db.from("questions").select("assignment_id, marks").in("assignment_id", assignmentIds)
      : { data: [] };

    const { data: submissions } = assignmentIds.length
      ? await db
          .from("submissions")
          .select("id, assignment_id, student_id, status, awarded_marks, submitted_at")
          .in("assignment_id", assignmentIds)
      : { data: [] };

    const assignmentRows = (assignments ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      subject: a.subject,
      dueAt: a.due_at,
      totalMarks: (questions ?? [])
        .filter((q) => q.assignment_id === a.id)
        .reduce((sum, q) => sum + q.marks, 0),
      questionCount: (questions ?? []).filter((q) => q.assignment_id === a.id).length,
      submittedCount: (submissions ?? []).filter(
        (s) => s.assignment_id === a.id && s.status === "submitted",
      ).length,
    }));

    const students = studentIds.map((id) => {
      const profile = (profiles ?? []).find((p) => p.id === id);
      const grades = assignmentRows.map((a) => {
        const sub = (submissions ?? []).find(
          (s) => s.assignment_id === a.id && s.student_id === id,
        );
        return {
          assignmentId: a.id,
          status: sub?.status ?? "not_started",
          awardedMarks: sub ? Number(sub.awarded_marks) : null,
          totalMarks: a.totalMarks,
        };
      });
      const marked = grades.filter((g) => g.awardedMarks !== null && g.status === "submitted");
      const earned = marked.reduce((sum, g) => sum + (g.awardedMarks ?? 0), 0);
      const possible = marked.reduce((sum, g) => sum + g.totalMarks, 0);
      return {
        id,
        name: profile?.full_name || profile?.email || "Student",
        email: profile?.email ?? "",
        grades,
        average: possible > 0 ? Math.round((earned / possible) * 100) : null,
      };
    });

    return { klass, assignments: assignmentRows, students };
  });

export const overrideAnswerMarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ answerId: z.string().uuid(), marks: z.number(), feedback: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: { awarded_marks: number; feedback?: string } = { awarded_marks: data.marks };
    if (data.feedback !== undefined) patch.feedback = data.feedback;
    const { data: updated, error } = await supabase
      .from("answers")
      .update(patch)
      .eq("id", data.answerId)
      .select("id, submission_id")
      .single();
    if (error) throw new Error(error.message);
    await recalcSubmission(await admin(), updated.submission_id);
    return { ok: true };
  });

export const getSubmissionDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assignmentId: z.string().uuid(), studentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("Not allowed.");

    const db = await admin();
    const { data: questions } = await db
      .from("questions")
      .select("id, position, question_text, mark_scheme, marks")
      .eq("assignment_id", data.assignmentId)
      .order("position");

    const { data: submission } = await db
      .from("submissions")
      .select("id, status, awarded_marks, total_marks, submitted_at")
      .eq("assignment_id", data.assignmentId)
      .eq("student_id", data.studentId)
      .maybeSingle();

    const { data: answers } = submission
      ? await db
          .from("answers")
          .select("id, question_id, answer_text, verdict, awarded_marks, feedback, attempts")
          .eq("submission_id", submission.id)
      : { data: [] };

    return { questions: questions ?? [], submission, answers: answers ?? [] };
  });

/* --------------------------------------------------------------- student --- */

export const joinClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().min(4) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const db = await admin();
    const { data: klass } = await db
      .from("classes")
      .select("id, name")
      .eq("join_code", data.code.trim().toUpperCase())
      .maybeSingle();
    if (!klass) throw new Error("No class matches that code.");

    const { error } = await db
      .from("class_members")
      .upsert({ class_id: klass.id, student_id: userId }, { onConflict: "class_id,student_id" });
    if (error) throw new Error(error.message);
    return { classId: klass.id, name: klass.name };
  });

export const listStudentWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships } = await supabase
      .from("class_members")
      .select("class_id")
      .eq("student_id", userId);
    const classIds = (memberships ?? []).map((m) => m.class_id);
    if (classIds.length === 0) return { classes: [], assignments: [] };

    const db = await admin();
    const [{ data: classes }, { data: assignments }] = await Promise.all([
      db.from("classes").select("id, name, curriculum, subject").in("id", classIds),
      db
        .from("assignments")
        .select("id, class_id, title, subject, due_at, created_at")
        .in("class_id", classIds)
        .eq("published", true)
        .order("created_at", { ascending: false }),
    ]);

    const assignmentIds = (assignments ?? []).map((a) => a.id);
    const { data: questions } = assignmentIds.length
      ? await db.from("questions").select("assignment_id, marks").in("assignment_id", assignmentIds)
      : { data: [] };
    const { data: submissions } = assignmentIds.length
      ? await db
          .from("submissions")
          .select("assignment_id, status, awarded_marks")
          .eq("student_id", userId)
          .in("assignment_id", assignmentIds)
      : { data: [] };

    return {
      classes: classes ?? [],
      assignments: (assignments ?? []).map((a) => {
        const sub = (submissions ?? []).find((s) => s.assignment_id === a.id);
        return {
          id: a.id,
          title: a.title,
          subject: a.subject,
          dueAt: a.due_at,
          className: (classes ?? []).find((c) => c.id === a.class_id)?.name ?? "",
          questionCount: (questions ?? []).filter((q) => q.assignment_id === a.id).length,
          totalMarks: (questions ?? [])
            .filter((q) => q.assignment_id === a.id)
            .reduce((sum, q) => sum + q.marks, 0),
          status: sub?.status ?? "not_started",
          awardedMarks: sub ? Number(sub.awarded_marks) : null,
        };
      }),
    };
  });

export const getAssignmentWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_study_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("This assignment is not available to you.");

    const db = await admin();
    const { data: assignmentRow } = await db
      .from("assignments")
      .select("id, title, subject, curriculum, instructions, due_at, class_id")
      .eq("id", data.assignmentId)
      .single();
    const assignment = assignmentRow!;
    const { data: klass } = await db
      .from("classes")
      .select("name")
      .eq("id", assignment.class_id)
      .maybeSingle();

    // Mark schemes are deliberately excluded here.
    const { data: questions } = await db
      .from("questions")
      .select("id, position, question_text, marks")
      .eq("assignment_id", data.assignmentId)
      .order("position");

    const submission = await ensureSubmission(db, data.assignmentId, userId);

    const { data: answers } = await db
      .from("answers")
      .select("id, question_id, answer_text, verdict, awarded_marks, feedback, attempts, resolved")
      .eq("submission_id", submission.id);

    const answerIds = (answers ?? []).map((a) => a.id);
    const { data: messages } = answerIds.length
      ? await db
          .from("tutor_messages")
          .select("id, answer_id, role, content, created_at")
          .in("answer_id", answerIds)
          .order("created_at")
      : { data: [] };

    return {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        subject: assignment.subject,
        curriculum: assignment.curriculum,
        instructions: assignment.instructions,
        dueAt: assignment.due_at,
        className: klass?.name ?? "",
      },
      questions: questions ?? [],
      submission,
      answers: answers ?? [],
      messages: messages ?? [],
    };
  });

export const gradeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        questionId: z.string().uuid(),
        answerText: z.string(),
        imagePaths: z.array(z.string()).max(6).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const imagePaths = (data.imagePaths ?? []).filter((path) => path.startsWith(`${userId}/`));
    if (!data.answerText.trim() && imagePaths.length === 0) {
      throw new Error("Write an answer or attach a photo of your working.");
    }
    const { data: allowed } = await supabase.rpc("can_study_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("This assignment is not available to you.");

    const db = await admin();
    const { data: question, error: qError } = await db
      .from("questions")
      .select("id, question_text, mark_scheme, marks, assignment_id")
      .eq("id", data.questionId)
      .single();
    if (qError) throw new Error(qError.message);
    if (question.assignment_id !== data.assignmentId) throw new Error("Question mismatch.");

    const { data: assignmentRow } = await db
      .from("assignments")
      .select("subject, curriculum")
      .eq("id", data.assignmentId)
      .single();
    const assignment = assignmentRow!;

    const imageUrls = await signWorkImages(db, imagePaths);

    const { markStudentAnswer } = await import("./marking.server");
    const result = await markStudentAnswer({
      curriculum: assignment.curriculum,
      subject: assignment.subject,
      question: question.question_text,
      markScheme: question.mark_scheme,
      marks: question.marks,
      answer: data.answerText,
      imageUrls,
    });

    const submission = await ensureSubmission(db, data.assignmentId, userId);
    const { data: existing } = await db
      .from("answers")
      .select("id, attempts")
      .eq("submission_id", submission.id)
      .eq("question_id", data.questionId)
      .maybeSingle();

    const payload = {
      submission_id: submission.id,
      question_id: data.questionId,
      answer_text: data.answerText,
      image_paths: imagePaths,
      verdict: result.verdict,
      awarded_marks: result.awardedMarks,
      feedback: result.feedback,
      attempts: (existing?.attempts ?? 0) + 1,
      resolved: result.verdict === "correct",
      updated_at: new Date().toISOString(),
    };

    const { data: answer, error } = existing
      ? await db.from("answers").update(payload).eq("id", existing.id).select("id").single()
      : await db.from("answers").insert(payload).select("id").single();
    if (error) throw new Error(error.message);

    if (result.verdict !== "correct" && result.leadingQuestion) {
      await db.from("tutor_messages").insert({
        answer_id: answer.id,
        role: "tutor",
        content: result.leadingQuestion,
      });
    }

    await recalcSubmission(db, submission.id);
    return { answerId: answer.id, ...result };
  });

export const extractPaperQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        subject: z.string().default(""),
        paperFiles: z
          .array(
            z.object({
              filename: z.string(),
              mimeType: z.string(),
              base64: z.string().min(1),
            }),
          )
          .min(1)
          .max(4),
        markSchemeFiles: z
          .array(
            z.object({
              filename: z.string(),
              mimeType: z.string(),
              base64: z.string().min(1),
            }),
          )
          .max(4)
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: klass, error } = await supabase
      .from("classes")
      .select("id, teacher_id, curriculum")
      .eq("id", data.classId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!klass || klass.teacher_id !== userId) throw new Error("You do not own this class.");

    const { extractQuestionsFromPapers } = await import("./paper-extract.server");
    const questions = await extractQuestionsFromPapers({
      curriculum: klass.curriculum,
      subject: data.subject,
      paperFiles: data.paperFiles,
      markSchemeFiles: data.markSchemeFiles,
    });
    if (questions.length === 0) {
      throw new Error("No questions could be read from those files. Try clearer or fewer pages.");
    }
    return { questions };
  });

export const sendTutorMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ answerId: z.string().uuid(), message: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: owns } = await supabase.rpc("owns_answer", {
      _answer_id: data.answerId,
      _user_id: userId,
    });
    if (!owns) throw new Error("Not your answer.");

    const db = await admin();
    const { data: answerRow } = await db
      .from("answers")
      .select("id, answer_text, question_id")
      .eq("id", data.answerId)
      .single();
    const answer = answerRow!;
    const { data: questionRow } = await db
      .from("questions")
      .select("question_text, mark_scheme, marks, assignment_id")
      .eq("id", answer.question_id)
      .single();
    const question = questionRow!;
    const { data: assignmentRow } = await db
      .from("assignments")
      .select("subject, curriculum")
      .eq("id", question.assignment_id)
      .single();
    const assignment = assignmentRow!;
    const { data: history } = await db
      .from("tutor_messages")
      .select("role, content")
      .eq("answer_id", data.answerId)
      .order("created_at");

    await db
      .from("tutor_messages")
      .insert({ answer_id: data.answerId, role: "student", content: data.message });

    const { tutorStep } = await import("./marking.server");
    const reply = await tutorStep({
      curriculum: assignment.curriculum,
      subject: assignment.subject,
      question: question.question_text,
      markScheme: question.mark_scheme,
      marks: question.marks,
      studentAnswer: answer.answer_text,
      history: (history ?? []).map((m) => ({
        role: m.role === "tutor" ? ("tutor" as const) : ("student" as const),
        content: m.content,
      })),
      latestMessage: data.message,
    });

    await db
      .from("tutor_messages")
      .insert({ answer_id: data.answerId, role: "tutor", content: reply });

    return { reply };
  });

export const submitAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("submissions")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("assignment_id", data.assignmentId)
      .eq("student_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------------------------------------------- helpers --- */

type AnyClient = Awaited<ReturnType<typeof admin>>;

async function ensureSubmission(db: AnyClient, assignmentId: string, studentId: string) {
  const { data: existing } = await db
    .from("submissions")
    .select("id, status, awarded_marks, total_marks, submitted_at")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (existing) return existing;

  const { data: questions } = await db
    .from("questions")
    .select("marks")
    .eq("assignment_id", assignmentId);
  const totalMarks = (questions ?? []).reduce((sum, q) => sum + q.marks, 0);

  const { data: created, error } = await db
    .from("submissions")
    .insert({ assignment_id: assignmentId, student_id: studentId, total_marks: totalMarks })
    .select("id, status, awarded_marks, total_marks, submitted_at")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

async function recalcSubmission(db: AnyClient, submissionId: string) {
  const { data: answers } = await db
    .from("answers")
    .select("awarded_marks")
    .eq("submission_id", submissionId);
  const awarded = (answers ?? []).reduce((sum, a) => sum + Number(a.awarded_marks), 0);
  await db.from("submissions").update({ awarded_marks: awarded }).eq("id", submissionId);
}

async function signWorkImages(db: AnyClient, paths: string[]) {
  if (paths.length === 0) return [];
  const { data } = await db.storage.from("student-work").createSignedUrls(paths, 3600);
  return (data ?? []).map((item) => item.signedUrl).filter((url): url is string => Boolean(url));
}
