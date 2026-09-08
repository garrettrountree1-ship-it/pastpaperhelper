import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { markFormativeAnswer, solveFormativeQuestion } from "@/lib/formative.server";
import { assertClassTeacher } from "@/lib/materials.server";

/** Teacher launches a timed quick question to everyone in the class. */
export const launchFormativeCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        sectionId: z.string().uuid().nullable().optional(),
        question: z.string().max(1000),
        expectedAnswer: z.string().max(2000).nullable().optional(),
        // A pasted picture of the question, held as a data URL.
        questionImage: z.string().max(6_000_000).nullable().optional(),
        seconds: z.number().int().min(15).max(1800),
        targetStudentId: z.string().uuid().nullable().optional(),
        targetStudentIds: z.array(z.string().uuid()).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClassTeacher(supabase, data.classId, userId);
    if (data.question.trim().length < 3 && !data.questionImage) {
      throw new Error("Add a question, or paste a picture of it.");
    }

    const targets = [
      ...new Set([...(data.targetStudentIds ?? []), ...(data.targetStudentId ? [data.targetStudentId] : [])]),
    ];
    if (targets.length > 0) {
      const { data: members } = await supabase
        .from("class_members")
        .select("student_id")
        .eq("class_id", data.classId)
        .in("student_id", targets);
      const inClass = new Set((members ?? []).map((m) => m.student_id as string));
      if (targets.some((id) => !inClass.has(id))) {
        throw new Error("One of those students is not in this class.");
      }
    }

    // Only one live check at a time — close anything still running.
    await supabase
      .from("formative_checks")
      .update({ closed_at: new Date().toISOString() })
      .eq("class_id", data.classId)
      .is("closed_at", null);

    const endsAt = new Date(Date.now() + data.seconds * 1000).toISOString();
    const { data: row, error } = await supabase
      .from("formative_checks")
      .insert({
        class_id: data.classId,
        section_id: data.sectionId ?? null,
        teacher_id: userId,
        question: data.question.trim(),
        expected_answer: data.expectedAnswer?.trim() || null,
        question_image: data.questionImage || null,
        seconds: data.seconds,
        ends_at: endsAt,
        target_student_id: targets.length === 1 ? (targets[0] ?? null) : null,
        target_student_ids: targets,
      })
      .select("id, question, seconds, ends_at")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, endsAt: row.ends_at as string };
  });


/** Teacher adds more time to the live check. */
export const extendFormativeCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ checkId: z.string().uuid(), seconds: z.number().int().min(5).max(1800) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: check } = await supabase
      .from("formative_checks")
      .select("id, ends_at, teacher_id")
      .eq("id", data.checkId)
      .maybeSingle();
    if (!check || check.teacher_id !== userId) throw new Error("You did not send this question.");
    // Extra time always starts from now when the timer has already run out.
    const base = Math.max(Date.now(), new Date(check.ends_at as string).getTime());
    const endsAt = new Date(base + data.seconds * 1000).toISOString();
    const { error } = await supabase
      .from("formative_checks")
      .update({ ends_at: endsAt })
      .eq("id", data.checkId);
    if (error) throw new Error(error.message);
    return { endsAt };
  });

/** Teacher releases the answer to everyone still looking at the question. */
export const releaseFormativeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ checkId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: check } = await supabase
      .from("formative_checks")
      .select("id, question, question_image, expected_answer, released_answer, teacher_id")
      .eq("id", data.checkId)
      .maybeSingle();
    if (!check || check.teacher_id !== userId) throw new Error("You did not send this question.");

    let answer = (check.released_answer as string | null) || (check.expected_answer as string | null);
    if (!answer?.trim()) {
      answer = await solveFormativeQuestion({
        question: check.question as string,
        questionImage: (check.question_image ?? null) as string | null,
      });
    }
    const { error } = await supabase
      .from("formative_checks")
      .update({ released_answer: answer, answer_released_at: new Date().toISOString() })
      .eq("id", data.checkId);
    if (error) throw new Error(error.message);
    return { answer };
  });

/** The live check for a class (if any), plus the caller's own attempts. */
export const getActiveFormativeCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // No end-time filter: the popup stays up until the teacher closes it.
    const { data: check } = await supabase
      .from("formative_checks")
      .select(
        "id, question, question_image, seconds, ends_at, teacher_id, expected_answer, released_answer, answer_released_at, target_student_id, target_student_ids",
      )
      .eq("class_id", data.classId)
      .is("closed_at", null)
      .or(
        `and(target_student_id.is.null,target_student_ids.eq.{}),target_student_ids.cs.{${userId}},target_student_id.eq.${userId},teacher_id.eq.${userId}`,
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!check) return null;


    const { data: mine } = await supabase
      .from("formative_responses")
      .select("id, answer, verdict, feedback, attempt, created_at")
      .eq("check_id", check.id)
      .eq("student_id", userId)
      .order("created_at", { ascending: true });

    return {
      id: check.id as string,
      question: check.question as string,
      questionImage: (check.question_image ?? null) as string | null,
      seconds: check.seconds as number,
      endsAt: check.ends_at as string,
      isTeacher: check.teacher_id === userId,
      hasExpectedAnswer: Boolean(check.expected_answer),
      releasedAnswer: (check.answer_released_at ? (check.released_answer ?? null) : null) as
        | string
        | null,
      targetStudentId: (check.target_student_id ?? null) as string | null,
      targetStudentIds: ((check.target_student_ids ?? []) as string[]),

      myAttempts: (mine ?? []).map((r) => ({
        id: r.id as string,
        answer: r.answer as string,
        verdict: r.verdict as string,
        feedback: (r.feedback ?? "") as string,
      })),
    };
  });


/** Student answers the live check; AI marks it and returns encouraging feedback. */
export const answerFormativeCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ checkId: z.string().uuid(), answer: z.string().min(1).max(2000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: check } = await supabase
      .from("formative_checks")
      .select(
        "id, question, question_image, expected_answer, ends_at, closed_at, teacher_id, target_student_id, target_student_ids",
      )
      .eq("id", data.checkId)
      .maybeSingle();
    if (!check) throw new Error("That class question is no longer available.");
    const allowed = new Set<string>([
      ...((check.target_student_ids ?? []) as string[]),
      ...(check.target_student_id ? [check.target_student_id as string] : []),
    ]);
    if (allowed.size > 0 && !allowed.has(userId) && check.teacher_id !== userId) {
      throw new Error("That question was sent to another student.");
    }

    if (check.closed_at || new Date(check.ends_at as string).getTime() < Date.now()) {
      throw new Error("Time is up for this question.");
    }

    const { count } = await supabase
      .from("formative_responses")
      .select("id", { count: "exact", head: true })
      .eq("check_id", data.checkId)
      .eq("student_id", userId);
    const attempt = (count ?? 0) + 1;

    const marked = await markFormativeAnswer({
      question: check.question as string,
      expectedAnswer: check.expected_answer as string | null,
      questionImage: (check.question_image ?? null) as string | null,
      answer: data.answer,
      attempt,
    });

    const { error } = await supabase.from("formative_responses").insert({
      check_id: data.checkId,
      student_id: userId,
      answer: data.answer.trim(),
      verdict: marked.verdict,
      feedback: marked.feedback,
      attempt,
    });
    if (error) throw new Error(error.message);
    return { ...marked, attempt };
  });

/** Live results for the teacher: one row per student, latest attempt. */
export const listFormativeResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ checkId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: check } = await supabase
      .from("formative_checks")
      .select("id, teacher_id")
      .eq("id", data.checkId)
      .maybeSingle();
    if (!check || check.teacher_id !== userId) return [];

    const { data: rows } = await supabase
      .from("formative_responses")
      .select("student_id, verdict, answer, attempt, created_at")
      .eq("check_id", data.checkId)
      .order("created_at", { ascending: true });

    const latest = new Map<string, { verdict: string; answer: string; attempts: number }>();
    for (const row of rows ?? []) {
      const prev = latest.get(row.student_id as string);
      latest.set(row.student_id as string, {
        verdict: row.verdict as string,
        answer: row.answer as string,
        attempts: (prev?.attempts ?? 0) + 1,
      });
    }

    const ids = [...latest.keys()];
    let names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      names = new Map(
        (profiles ?? []).map((p) => [
          p.id as string,
          ((p.full_name as string | null) || (p.email as string | null) || "Student") as string,
        ]),
      );
    }

    return ids.map((id) => ({
      studentId: id,
      name: names.get(id) ?? "Student",
      ...latest.get(id)!,
    }));
  });

export const closeFormativeCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ checkId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("formative_checks")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", data.checkId)
      .eq("teacher_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Teacher record book: every formative check ever sent in a class, with the
 * lesson section it belonged to and every student answer with its verdict.
 */
export const listFormativeHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClassTeacher(supabase, data.classId, userId);

    const { data: checks } = await supabase
      .from("formative_checks")
      .select("id, question, expected_answer, seconds, ends_at, closed_at, created_at, section_id")
      .eq("class_id", data.classId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!checks || checks.length === 0) return [];

    const checkIds = checks.map((c) => c.id as string);
    const { data: responses } = await supabase
      .from("formative_responses")
      .select("check_id, student_id, answer, verdict, feedback, attempt, created_at")
      .in("check_id", checkIds)
      .order("created_at", { ascending: true });

    const sectionIds = [
      ...new Set(checks.map((c) => c.section_id as string | null).filter(Boolean) as string[]),
    ];
    const sectionTitles = new Map<string, string>();
    if (sectionIds.length > 0) {
      const { data: sections } = await supabase
        .from("unit_sections")
        .select("id, title, unit_id, class_units(title)")
        .in("id", sectionIds);
      for (const section of sections ?? []) {
        const unit = (section as { class_units?: { title?: string } | null }).class_units;
        sectionTitles.set(
          section.id as string,
          unit?.title ? `${unit.title} · ${section.title as string}` : (section.title as string),
        );
      }
    }

    // Everyone in the class, so the teacher can also see who never answered.
    const { data: members } = await supabase
      .from("class_members")
      .select("student_id")
      .eq("class_id", data.classId);
    const memberIds = (members ?? []).map((m) => m.student_id as string);
    const ids = [...new Set([...memberIds, ...(responses ?? []).map((r) => r.student_id as string)])];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      for (const p of profiles ?? []) {
        names.set(
          p.id as string,
          ((p.full_name as string | null) || (p.email as string | null) || "Student") as string,
        );
      }
    }

    return checks.map((check) => {
      const rows = (responses ?? []).filter((r) => r.check_id === check.id);
      const perStudent = new Map<
        string,
        { attempts: number; verdict: string; answer: string; feedback: string }
      >();
      for (const row of rows) {
        const prev = perStudent.get(row.student_id as string);
        perStudent.set(row.student_id as string, {
          attempts: (prev?.attempts ?? 0) + 1,
          verdict: row.verdict as string,
          answer: row.answer as string,
          feedback: (row.feedback ?? "") as string,
        });
      }
      const students = ids.map((id) => {
        const entry = perStudent.get(id);
        return {
          studentId: id,
          name: names.get(id) ?? "Student",
          answered: Boolean(entry),
          attempts: entry?.attempts ?? 0,
          verdict: entry?.verdict ?? "",
          answer: entry?.answer ?? "",
          feedback: entry?.feedback ?? "",
        };
      });
      return {
        id: check.id as string,
        question: check.question as string,
        expectedAnswer: (check.expected_answer ?? null) as string | null,
        seconds: check.seconds as number,
        sentAt: check.created_at as string,
        lesson: check.section_id ? (sectionTitles.get(check.section_id as string) ?? "Lesson") : "—",
        answeredCount: students.filter((s) => s.answered).length,
        correctCount: students.filter((s) => s.verdict === "correct").length,
        students,
      };
    });
  });

/**
 * Student review book: every class question they were asked, their own
 * attempts, and the answer once it is available.
 */
export const listMyFormativeChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: checks } = await supabase
      .from("formative_checks")
      .select(
        "id, question, question_image, expected_answer, released_answer, answer_released_at, ends_at, closed_at, created_at, section_id, target_student_id, target_student_ids",
      )
      .eq("class_id", data.classId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!checks || checks.length === 0) return [];

    // Only the questions this student was actually asked.
    const mine = checks.filter((c) => {
      const targets = [
        ...((c.target_student_ids ?? []) as string[]),
        ...(c.target_student_id ? [c.target_student_id as string] : []),
      ];
      return targets.length === 0 || targets.includes(userId);
    });
    if (mine.length === 0) return [];

    const ids = mine.map((c) => c.id as string);
    const { data: responses } = await supabase
      .from("formative_responses")
      .select("check_id, answer, verdict, feedback, attempt, created_at")
      .in("check_id", ids)
      .eq("student_id", userId)
      .order("created_at", { ascending: true });

    const sectionIds = [
      ...new Set(mine.map((c) => c.section_id as string | null).filter(Boolean) as string[]),
    ];
    const sectionTitles = new Map<string, string>();
    if (sectionIds.length > 0) {
      const { data: sections } = await supabase
        .from("unit_sections")
        .select("id, title, class_units(title)")
        .in("id", sectionIds);
      for (const section of sections ?? []) {
        const unit = (section as { class_units?: { title?: string } | null }).class_units;
        sectionTitles.set(
          section.id as string,
          unit?.title ? `${unit.title} · ${section.title as string}` : (section.title as string),
        );
      }
    }

    return mine.map((check) => {
      const finished =
        Boolean(check.closed_at) || new Date(check.ends_at as string).getTime() < Date.now();
      const released = Boolean(check.answer_released_at);
      // The answer is shown once the teacher released it, or once the
      // question is over — never while it is still live.
      const answer =
        released || finished
          ? ((check.released_answer as string | null) ||
              (check.expected_answer as string | null) ||
              null)
          : null;
      return {
        id: check.id as string,
        question: check.question as string,
        questionImage: (check.question_image ?? null) as string | null,
        sentAt: check.created_at as string,
        lesson: check.section_id ? (sectionTitles.get(check.section_id as string) ?? "Lesson") : "",
        answer,
        stillLive: !finished,
        myAttempts: (responses ?? [])
          .filter((r) => r.check_id === check.id)
          .map((r) => ({
            answer: r.answer as string,
            verdict: r.verdict as string,
            feedback: (r.feedback ?? "") as string,
          })),
      };
    });
  });
