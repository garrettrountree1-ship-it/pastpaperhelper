import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanMathText } from "@/lib/math-text";

/** Admin client (typed loosely: the help table is newer than the generated types). */
async function adminDb(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as any;
}

const modeSchema = z.enum(["hint", "steps"]);

async function loadQuestion(db: any, questionId: string, userId: string) {
  const { data: question } = await db
    .from("questions")
    .select("id, question_text, mark_scheme, marks, assignment_id")
    .eq("id", questionId)
    .maybeSingle();
  if (!question) throw new Error("That question no longer exists.");

  const { data: assignment } = await db
    .from("assignments")
    .select("id, class_id, subject, curriculum")
    .eq("id", question.assignment_id)
    .maybeSingle();
  if (!assignment) throw new Error("That homework no longer exists.");

  const { data: membership } = await db
    .from("class_members")
    .select("student_id")
    .eq("class_id", assignment.class_id)
    .eq("student_id", userId)
    .maybeSingle();
  if (!membership) {
    // Teachers (and co-teachers) previewing the student homework view get full
    // access too. The is_class_teacher RPC checks auth.uid(), which is null on
    // the admin client, so check ownership directly instead.
    const [{ data: owned }, { data: co }] = await Promise.all([
      db.from("classes").select("id").eq("id", assignment.class_id).eq("teacher_id", userId).maybeSingle(),
      db
        .from("class_coteachers")
        .select("class_id")
        .eq("class_id", assignment.class_id)
        .eq("teacher_id", userId)
        .maybeSingle(),
    ]);
    if (!owned && !co) throw new Error("You are not in this class.");
  }

  return { question, assignment };
}

/** The student's own hint / step-by-step conversations for one question. */
export const listQuestionHelp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ questionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const db = await adminDb();
    const { data: rows } = await db
      .from("question_help_messages")
      .select("id, mode, role, content, created_at")
      .eq("question_id", data.questionId)
      .eq("student_id", userId)
      .order("created_at");

    const messages = (rows ?? []) as Array<{
      id: string;
      mode: "hint" | "steps";
      role: string;
      content: string;
      created_at: string;
    }>;
    return {
      hint: messages.filter((m) => m.mode === "hint"),
      steps: messages.filter((m) => m.mode === "steps"),
    };
  });

/**
 * One turn of on-demand help. Called with no message to open the window
 * (first hint / step 1), or with the student's own typed message.
 */
export const askQuestionHelp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        questionId: z.string().uuid(),
        mode: modeSchema,
        message: z.string().trim().max(2000).nullable().optional(),
        answerDraft: z.string().max(6000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const db = await adminDb();
    const { question, assignment } = await loadQuestion(db, data.questionId, userId);

    const { data: history } = await db
      .from("question_help_messages")
      .select("role, content")
      .eq("question_id", data.questionId)
      .eq("student_id", userId)
      .eq("mode", data.mode)
      .order("created_at");

    const message = data.message?.trim() || null;
    if (message) {
      await db.from("question_help_messages").insert({
        question_id: data.questionId,
        student_id: userId,
        mode: data.mode,
        role: "student",
        content: message,
      });
    }

    const { tutorSettingsForAssignment } = await import("./tutor-settings.server");
    const prefs = await tutorSettingsForAssignment(db, assignment.id, userId);
    if (data.mode === "hint" && !prefs.allowHint) {
      throw new Error("Your teacher has turned hints off for this homework.");
    }
    if (data.mode === "steps" && !prefs.allowSteps) {
      throw new Error("Your teacher has turned the step-by-step breakdown off for this homework.");
    }

    const { questionHelpStep } = await import("./question-help.server");
    const reply = await questionHelpStep({
      mode: data.mode,
      curriculum: assignment.curriculum ?? "",
      subject: assignment.subject ?? "",
      question: cleanMathText(question.question_text ?? ""),
      markScheme: question.mark_scheme ?? "",
      marks: question.marks ?? 1,
      studentAnswer: data.answerDraft ?? null,
      level: prefs.level,
      language: prefs.language,
      history: ((history ?? []) as Array<{ role: string; content: string }>).slice(-10).map((m) => ({
        role: m.role === "tutor" ? ("tutor" as const) : ("student" as const),
        content: m.content,
      })),
      latestMessage: message,
    });

    await db.from("question_help_messages").insert({
      question_id: data.questionId,
      student_id: userId,
      mode: data.mode,
      role: "tutor",
      content: reply,
    });

    return { reply };
  });
