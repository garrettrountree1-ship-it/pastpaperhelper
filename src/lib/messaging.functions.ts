import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";

/* ----------------------------------------------------------- bulletin ---- */

export const listClassBulletin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("class_announcements")
      .select("id, class_id, title, body, created_at")
      .eq("class_id", data.classId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Every bulletin post across the classes the signed-in student belongs to. */
export const listStudentBulletins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("class_announcements")
      .select("id, class_id, title, body, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const postAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        title: z.string().trim().max(160).default(""),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("class_announcements").insert({
      class_id: data.classId,
      author_id: userId,
      title: data.title,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("class_announcements")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ----------------------------------------------------------- messages ---- */

const messageSelect =
  "id, class_id, student_id, sender_id, sender_role, assignment_id, question_id, topic, body, created_at, reply_to_id";

/** Look up the question text for messages that reference a specific question. */
async function attachQuestionText<T extends { question_id: string | null }>(
  supabase: { from: (t: string) => any },
  rows: T[],
) {
  const ids = [...new Set(rows.map((r) => r.question_id).filter((id): id is string => !!id))];
  const questions = ids.length
    ? ((await supabase.from("questions").select("id, position, question_text").in("id", ids))
        .data ?? [])
    : [];
  return rows.map((row) => {
    const q = questions.find((item: { id: string }) => item.id === row.question_id);
    return {
      ...row,
      questionText: (q?.question_text as string | undefined) ?? null,
      questionPosition: (q?.position as number | undefined) ?? null,
    };
  });
}

/** Student's own conversation with their teachers (never other students'). */
export const listMyMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("class_messages")
      .select(messageSelect)
      .eq("student_id", userId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return attachQuestionText(supabase, rows ?? []);
  });

export const sendMessageToTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        assignmentId: z.string().uuid().nullish(),
        questionId: z.string().uuid().nullish(),
        topic: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(2000),
        replyToId: z.string().uuid().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!isEnglishOnly(data.body)) throw new Error(ENGLISH_ONLY_MESSAGE);
    const { supabase, userId } = context;
    const { error } = await supabase.from("class_messages").insert({
      class_id: data.classId,
      student_id: userId,
      sender_id: userId,
      sender_role: "student",
      assignment_id: data.assignmentId ?? null,
      question_id: data.questionId ?? null,
      topic: data.topic,
      body: data.body,
      reply_to_id: data.replyToId ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Teacher view: every message in one class, plus the student's name. */
export const listClassMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("class_messages")
      .select(messageSelect)
      .eq("class_id", data.classId)
      .order("created_at");
    if (error) throw new Error(error.message);
    const studentIds = [...new Set((rows ?? []).map((r) => r.student_id))];
    const { data: profiles } = studentIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", studentIds)
      : { data: [] as { id: string; full_name: string; email: string | null }[] };
    const withQuestions = await attachQuestionText(supabase, rows ?? []);
    return withQuestions.map((row) => {
      const profile = (profiles ?? []).find((p) => p.id === row.student_id);
      return {
        ...row,
        studentName: profile?.full_name || profile?.email || "Student",
      };
    });
  });

export const replyToStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        studentId: z.string().uuid(),
        topic: z.string().trim().max(200).default(""),
        body: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("class_messages").insert({
      class_id: data.classId,
      student_id: data.studentId,
      sender_id: userId,
      sender_role: "teacher",
      topic: data.topic,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
