import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { VocabItem } from "./vocab.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Confirms the caller studies or teaches this assignment, and loads its context. */
async function assignmentContext(
  supabase: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  userId: string,
  assignmentId: string,
) {
  const [{ data: canStudy }, { data: canTeach }] = await Promise.all([
    supabase.rpc("can_study_assignment", { _assignment_id: assignmentId, _user_id: userId }),
    supabase.rpc("can_teach_assignment", { _assignment_id: assignmentId, _user_id: userId }),
  ]);
  if (!canStudy && !canTeach) throw new Error("Not available to you.");

  const db = await admin();
  const { data: assignment } = await db
    .from("assignments")
    .select("id, subject, class_id")
    .eq("id", assignmentId)
    .single();
  if (!assignment) throw new Error("Homework not found.");

  const { tutorSettingsForAssignment } = await import("./tutor-settings.server");
  const settings = await tutorSettingsForAssignment(db, assignmentId, canStudy ? userId : null);

  return { db, assignment, settings };
}

/** Strips translations when the teacher turned them off for this homework. */
function applyTranslationToggle(items: VocabItem[], enabled: boolean): VocabItem[] {
  return enabled ? items : items.map((item) => ({ ...item, translation: "" }));
}

/** Vocabulary list for the whole homework, translated into the teacher's language. */
export const getAssignmentVocab = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assignmentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { db, assignment, settings } = await assignmentContext(
      supabase as never,
      userId,
      data.assignmentId,
    );
    const language = settings.vocabLanguage;
    const translationEnabled = settings.vocabTranslation;

    const { data: cached } = await db
      .from("assignment_vocab")
      .select("terms")
      .eq("assignment_id", data.assignmentId)
      .eq("language", language)
      .maybeSingle();

    if (cached && Array.isArray(cached.terms) && cached.terms.length > 0) {
      return {
        language,
        translationEnabled,
        level: settings.level,
        items: applyTranslationToggle(cached.terms as unknown as VocabItem[], translationEnabled),
      };
    }

    const { data: questions } = await db
      .from("questions")
      .select("question_text")
      .eq("assignment_id", data.assignmentId)
      .order("position");

    const texts = (questions ?? []).map((q: { question_text: string }) => q.question_text);
    if (texts.length === 0) {
      return {
        language,
        translationEnabled,
        level: settings.level,
        items: [] as VocabItem[],
      };
    }

    const { assignmentVocab } = await import("./vocab.server");
    const items = await assignmentVocab(texts, (assignment.subject as string) ?? "", language);

    if (items.length > 0) {
      await db
        .from("assignment_vocab")
        .upsert(
          { assignment_id: data.assignmentId, language, terms: items },
          { onConflict: "assignment_id,language" },
        );
    }
    return {
      language,
      translationEnabled,
      level: settings.level,
      items: applyTranslationToggle(items, translationEnabled),
    };
  });


/** In-depth explanation of one term, with illustrative pictures. */
export const explainVocabTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ assignmentId: z.string().uuid(), term: z.string().min(1).max(80) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { db, assignment, settings } = await assignmentContext(
      supabase as never,
      userId,
      data.assignmentId,
    );
    const language = settings.vocabLanguage;
    const term = data.term.trim();

    const { data: cached } = await db
      .from("vocab_explanations")
      .select("explanation, translation, image_urls")
      .eq("assignment_id", data.assignmentId)
      .eq("term", term)
      .eq("language", language)
      .maybeSingle();

    if (cached?.explanation) {
      return {
        term,
        language,
        translation: settings.vocabTranslation ? (cached.translation as string) : "",
        explanation: cached.explanation as string,
        imageUrls: (cached.image_urls as string[]) ?? [],
      };
    }

    const { explainVocab } = await import("./vocab.server");
    const result = await explainVocab(
      term,
      (assignment.subject as string) ?? "",
      language,
      settings.level,
    );

    await db.from("vocab_explanations").upsert(
      {
        assignment_id: data.assignmentId,
        term,
        language,
        explanation: result.explanation,
        translation: result.translation,
        image_urls: result.imageUrls,
      },
      { onConflict: "assignment_id,term,language" },
    );

    return { term, language, ...result };
  });
