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
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClassTeacher(supabase, data.classId, userId);

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
      .select("id, question, seconds, ends_at, teacher_id, expected_answer")
      .eq("class_id", data.classId)
      .is("closed_at", null)
      .gt("ends_at", new Date().toISOString())
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
