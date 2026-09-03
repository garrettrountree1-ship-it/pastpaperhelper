import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { markFormativeAnswer } from "@/lib/formative.server";
import { assertClassTeacher } from "@/lib/materials.server";

/** Teacher launches a timed quick question to everyone in the class. */
export const launchFormativeCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        sectionId: z.string().uuid().nullable().optional(),
        question: z.string().min(3).max(1000),
        expectedAnswer: z.string().max(2000).nullable().optional(),
        seconds: z.number().int().min(15).max(1800),
        targetStudentId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClassTeacher(supabase, data.classId, userId);

    const target = data.targetStudentId ?? null;
    if (target) {
      const { data: member } = await supabase
        .from("class_members")
        .select("student_id")
        .eq("class_id", data.classId)
        .eq("student_id", target)
        .maybeSingle();
      if (!member) throw new Error("That student is not in this class.");
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
        seconds: data.seconds,
        ends_at: endsAt,
        target_student_id: target,
      })
      .select("id, question, seconds, ends_at")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, endsAt: row.ends_at as string };
  });


/** The live check for a class (if any), plus the caller's own attempts. */
export const getActiveFormativeCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: check } = await supabase
      .from("formative_checks")
      .select("id, question, seconds, ends_at, teacher_id, expected_answer, target_student_id")
      .eq("class_id", data.classId)
      .is("closed_at", null)
      .gt("ends_at", new Date().toISOString())
      .or(`target_student_id.is.null,target_student_id.eq.${userId},teacher_id.eq.${userId}`)
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
      seconds: check.seconds as number,
      endsAt: check.ends_at as string,
      isTeacher: check.teacher_id === userId,
      hasExpectedAnswer: Boolean(check.expected_answer),
      targetStudentId: (check.target_student_id ?? null) as string | null,

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
      .select("id, question, expected_answer, ends_at, closed_at")
      .eq("id", data.checkId)
      .maybeSingle();
    if (!check) throw new Error("That class question is no longer available.");
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
