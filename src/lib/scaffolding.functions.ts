import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as any;
}

export type ScaffoldOverride = {
  allowHint: boolean | null;
  allowSteps: boolean | null;
  maxAttempts: number | null;
  maxChoiceAttempts: number | null;
  examMode: boolean | null;
  maxPaperSubmissions: number | null;
};

const overrideInput = {
  allowHint: z.boolean().nullable().optional(),
  allowSteps: z.boolean().nullable().optional(),
  maxAttempts: z.number().int().min(0).max(20).nullable().optional(),
  maxChoiceAttempts: z.number().int().min(0).max(20).nullable().optional(),
  examMode: z.boolean().nullable().optional(),
  maxPaperSubmissions: z.number().int().min(0).max(20).nullable().optional(),
};

/** Everything the Scaffolding options screen needs for one class. */
export const getClassScaffolding = createServerFn({ method: "POST" })
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
    const [{ data: klass }, { data: assignments }, { data: members }] = await Promise.all([
      db
        .from("classes")
        .select(
          "allow_hint, allow_steps, max_answer_attempts, max_choice_attempts, exam_mode, max_paper_submissions",
        )
        .eq("id", data.classId)
        .single(),
      db
        .from("assignments")
        .select(
          "id, title, allow_hint, allow_steps, max_answer_attempts, max_choice_attempts, exam_mode, max_paper_submissions, archived_at",
        )
        .eq("class_id", data.classId)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      db.from("class_members").select("student_id").eq("class_id", data.classId),
    ]);

    const studentIds = (members ?? []).map((m: any) => m.student_id as string);
    const assignmentIds = (assignments ?? []).map((a: any) => a.id as string);

    const [{ data: profiles }, { data: overrides }] = await Promise.all([
      studentIds.length
        ? db.from("profiles").select("id, full_name, email").in("id", studentIds)
        : Promise.resolve({ data: [] as any[] }),
      assignmentIds.length
        ? db
            .from("student_assignment_settings")
            .select(
              "assignment_id, student_id, allow_hint, allow_steps, max_answer_attempts, max_choice_attempts, exam_mode, max_paper_submissions",
            )
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const students = (profiles ?? [])
      .map((p: any) => ({
        id: p.id as string,
        name: (p.full_name as string) || (p.email as string) || "Student",
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return {
      klass: {
        allowHint: klass?.allow_hint !== false,
        allowSteps: klass?.allow_steps !== false,
        maxAttempts: Number(klass?.max_answer_attempts ?? 0) || 0,
        maxChoiceAttempts: Number(klass?.max_choice_attempts ?? 1) || 0,
        examMode: Boolean(klass?.exam_mode),
        maxPaperSubmissions: Number(klass?.max_paper_submissions ?? 0) || 0,
      },
      students,
      assignments: (assignments ?? []).map((a: any) => ({
        id: a.id as string,
        title: a.title as string,
        allowHint: (a.allow_hint ?? null) as boolean | null,
        allowSteps: (a.allow_steps ?? null) as boolean | null,
        maxAttempts: (a.max_answer_attempts ?? null) as number | null,
        maxChoiceAttempts: (a.max_choice_attempts ?? null) as number | null,
        examMode: (a.exam_mode ?? null) as boolean | null,
        maxPaperSubmissions: (a.max_paper_submissions ?? null) as number | null,
      })),
      studentOverrides: (overrides ?? []).map((o: any) => ({
        assignmentId: o.assignment_id as string,
        studentId: o.student_id as string,
        allowHint: (o.allow_hint ?? null) as boolean | null,
        allowSteps: (o.allow_steps ?? null) as boolean | null,
        maxAttempts: (o.max_answer_attempts ?? null) as number | null,
        maxChoiceAttempts: (o.max_choice_attempts ?? null) as number | null,
        examMode: (o.exam_mode ?? null) as boolean | null,
        maxPaperSubmissions: (o.max_paper_submissions ?? null) as number | null,
      })),
    };
  });

/** Class-wide defaults, applied to every homework that follows the default. */
export const setClassScaffolding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        allowHint: z.boolean().optional(),
        allowSteps: z.boolean().optional(),
        maxAttempts: z.number().int().min(0).max(20).optional(),
        maxChoiceAttempts: z.number().int().min(0).max(20).optional(),
        examMode: z.boolean().optional(),
        maxPaperSubmissions: z.number().int().min(0).max(20).optional(),
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

    const patch: Record<string, unknown> = {};
    if (data.allowHint !== undefined) patch["allow_hint"] = data.allowHint;
    if (data.allowSteps !== undefined) patch["allow_steps"] = data.allowSteps;
    if (data.maxAttempts !== undefined) patch["max_answer_attempts"] = data.maxAttempts;
    if (data.maxChoiceAttempts !== undefined) patch["max_choice_attempts"] = data.maxChoiceAttempts;
    if (data.examMode !== undefined) patch["exam_mode"] = data.examMode;
    if (data.maxPaperSubmissions !== undefined)
      patch["max_paper_submissions"] = data.maxPaperSubmissions;
    if (Object.keys(patch).length === 0) return { ok: true };

    const db = await admin();
    const { error } = await db.from("classes").update(patch).eq("id", data.classId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** One homework: null means "same as the class default". */
export const setAssignmentScaffolding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assignmentId: z.string().uuid(), ...overrideInput }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("You do not teach this homework.");

    const patch: Record<string, unknown> = {};
    if (data.allowHint !== undefined) patch["allow_hint"] = data.allowHint;
    if (data.allowSteps !== undefined) patch["allow_steps"] = data.allowSteps;
    if (data.maxAttempts !== undefined) patch["max_answer_attempts"] = data.maxAttempts;
    if (data.maxChoiceAttempts !== undefined) patch["max_choice_attempts"] = data.maxChoiceAttempts;
    if (data.examMode !== undefined) patch["exam_mode"] = data.examMode;
    if (data.maxPaperSubmissions !== undefined)
      patch["max_paper_submissions"] = data.maxPaperSubmissions;
    if (Object.keys(patch).length === 0) return { ok: true };

    const db = await admin();
    const { error } = await db.from("assignments").update(patch).eq("id", data.assignmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** One student on one homework: null means "same as this homework". */
export const setStudentScaffolding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        studentId: z.string().uuid(),
        ...overrideInput,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("You do not teach this homework.");

    const patch: Record<string, unknown> = {
      assignment_id: data.assignmentId,
      student_id: data.studentId,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.allowHint !== undefined) patch["allow_hint"] = data.allowHint;
    if (data.allowSteps !== undefined) patch["allow_steps"] = data.allowSteps;
    if (data.maxAttempts !== undefined) patch["max_answer_attempts"] = data.maxAttempts;
    if (data.maxChoiceAttempts !== undefined) patch["max_choice_attempts"] = data.maxChoiceAttempts;
    if (data.examMode !== undefined) patch["exam_mode"] = data.examMode;
    if (data.maxPaperSubmissions !== undefined)
      patch["max_paper_submissions"] = data.maxPaperSubmissions;

    const db = await admin();
    const { error } = await db
      .from("student_assignment_settings")
      .upsert(patch, { onConflict: "assignment_id,student_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
