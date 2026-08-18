import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { TUTOR_LANGUAGES, TUTOR_LEVELS } from "./tutor-settings";

const levelEnum = z.enum(TUTOR_LEVELS.map((l) => l.value) as [string, ...string[]]);
const languageEnum = z.enum(TUTOR_LANGUAGES as unknown as [string, ...string[]]);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Teacher view: class defaults plus each student's override. */
export const getClassTutorSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isTeacher) throw new Error("You do not own this class.");

    const db = await admin();
    const { data: klass } = await db
      .from("classes")
      .select(
        "tutor_language, tutor_level, protect_questions, keyword_translation, student_can_change_level",
      )
      .eq("id", data.classId)
      .single();

    const { data: members } = await db
      .from("class_members")
      .select("student_id")
      .eq("class_id", data.classId);
    const ids = (members ?? []).map((m) => m.student_id);

    const [{ data: profiles }, { data: overrides }] = await Promise.all([
      ids.length
        ? db.from("profiles").select("id, full_name, email").in("id", ids)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; email: string | null }> }),
      ids.length
        ? db
            .from("class_student_settings")
            .select("student_id, tutor_language, tutor_level, student_can_change_level")
            .eq("class_id", data.classId)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);

    const overrideMap = new Map(
      (overrides ?? []).map((o: any) => [o.student_id as string, o]),
    );

    return {
      klass: {
        tutorLanguage: klass!.tutor_language as string,
        tutorLevel: klass!.tutor_level as string,
        protectQuestions: Boolean(klass!.protect_questions),
        keywordTranslation: Boolean(klass!.keyword_translation),
        studentCanChangeLevel: Boolean(klass!.student_can_change_level),
      },
      students: (profiles ?? [])
        .map((p: any) => {
          const o = overrideMap.get(p.id);
          return {
            id: p.id as string,
            name: (p.full_name as string) || (p.email as string) || "Student",
            email: (p.email as string | null) ?? null,
            tutorLanguage: (o?.tutor_language as string | null) ?? null,
            tutorLevel: (o?.tutor_level as string | null) ?? null,
            studentCanChangeLevel: (o?.student_can_change_level as boolean | null) ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

/** Teacher sets the whole-class defaults. */
export const setClassTutorSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        tutorLanguage: languageEnum.optional(),
        tutorLevel: levelEnum.optional(),
        protectQuestions: z.boolean().optional(),
        keywordTranslation: z.boolean().optional(),
        studentCanChangeLevel: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isTeacher) throw new Error("You do not own this class.");

    const patch: Record<string, unknown> = {};
    if (data.tutorLanguage !== undefined) patch["tutor_language"] = data.tutorLanguage;
    if (data.tutorLevel !== undefined) patch["tutor_level"] = data.tutorLevel;
    if (data.protectQuestions !== undefined) patch["protect_questions"] = data.protectQuestions;
    if (data.keywordTranslation !== undefined)
      patch["keyword_translation"] = data.keywordTranslation;
    if (data.studentCanChangeLevel !== undefined)
      patch["student_can_change_level"] = data.studentCanChangeLevel;
    if (Object.keys(patch).length === 0) return { ok: true };

    const db = await admin();
    const { error } = await db.from("classes").update(patch).eq("id", data.classId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Teacher sets one student's override. `null` clears it back to the class default. */
export const setStudentTutorSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        studentId: z.string().uuid(),
        tutorLanguage: languageEnum.nullable().optional(),
        tutorLevel: levelEnum.nullable().optional(),
        studentCanChangeLevel: z.boolean().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isTeacher) throw new Error("You do not own this class.");

    const db = await admin();
    const { data: existing } = await db
      .from("class_student_settings")
      .select("id, tutor_language, tutor_level, student_can_change_level")
      .eq("class_id", data.classId)
      .eq("student_id", data.studentId)
      .maybeSingle();

    const next = {
      class_id: data.classId,
      student_id: data.studentId,
      tutor_language:
        data.tutorLanguage !== undefined
          ? data.tutorLanguage
          : ((existing?.tutor_language as string | null) ?? null),
      tutor_level:
        data.tutorLevel !== undefined
          ? data.tutorLevel
          : ((existing?.tutor_level as string | null) ?? null),
      student_can_change_level:
        data.studentCanChangeLevel !== undefined
          ? data.studentCanChangeLevel
          : ((existing?.student_can_change_level as boolean | null) ?? null),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };

    const { error } = existing
      ? await db.from("class_student_settings").update(next).eq("id", existing.id)
      : await db.from("class_student_settings").insert(next);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Student reads their own effective tutor settings for a class. */
export const getMyTutorSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase.rpc("is_class_member", {
      _class_id: data.classId,
      _user_id: userId,
    });
    const { data: teacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!member && !teacher) throw new Error("Not your class.");

    const db = await admin();
    const { effectiveTutorSettings } = await import("./tutor-settings.server");
    return effectiveTutorSettings(db, data.classId, userId);
  });

/** Student changes their own tutor level/language, only when the teacher allowed it. */
export const setMyTutorSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        tutorLevel: levelEnum.optional(),
        tutorLanguage: languageEnum.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase.rpc("is_class_member", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!member) throw new Error("Not your class.");

    const db = await admin();
    const { effectiveTutorSettings } = await import("./tutor-settings.server");
    const current = await effectiveTutorSettings(db, data.classId, userId);
    if (!current.studentCanChangeLevel) {
      throw new Error("Your teacher controls your tutor level.");
    }

    const { data: existing } = await db
      .from("class_student_settings")
      .select("id")
      .eq("class_id", data.classId)
      .eq("student_id", userId)
      .maybeSingle();

    const patch = {
      tutor_level: data.tutorLevel ?? current.level,
      tutor_language: data.tutorLanguage ?? current.language,
      updated_at: new Date().toISOString(),
    };

    const { error } = existing
      ? await db.from("class_student_settings").update(patch).eq("id", existing.id)
      : await db
          .from("class_student_settings")
          .insert({ class_id: data.classId, student_id: userId, ...patch });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Chinese gloss for the key words in one question (cached on the question). */
export const getQuestionGlossary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ questionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = await admin();
    const { data: question } = await db
      .from("questions")
      .select("id, question_text, assignment_id, keyword_glossary")
      .eq("id", data.questionId)
      .single();

    const [{ data: canStudy }, { data: canTeach }] = await Promise.all([
      supabase.rpc("can_study_assignment", {
        _assignment_id: question!.assignment_id,
        _user_id: userId,
      }),
      supabase.rpc("can_teach_assignment", {
        _assignment_id: question!.assignment_id,
        _user_id: userId,
      }),
    ]);
    if (!canStudy && !canTeach) throw new Error("Not available to you.");

    const cached = question!.keyword_glossary;
    if (Array.isArray(cached) && cached.length > 0) {
      return { terms: cached as Array<{ term: string; translation: string }> };
    }

    const { data: assignment } = await db
      .from("assignments")
      .select("subject")
      .eq("id", question!.assignment_id)
      .maybeSingle();

    const { keywordGlossary } = await import("./glossary.server");
    const terms = await keywordGlossary(question!.question_text, assignment?.subject ?? "");
    if (terms.length > 0) {
      await db.from("questions").update({ keyword_glossary: terms }).eq("id", question!.id);
    }
    return { terms };
  });
