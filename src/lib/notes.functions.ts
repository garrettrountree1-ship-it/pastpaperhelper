import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertClassTeacher, assertUnitTeacher } from "@/lib/materials.server";
import { lessonTutorReply, summariseTeacherNotes } from "@/lib/notes.server";
import { effectiveTutorSettings } from "@/lib/tutor-settings.server";

const blockSchema = z.union([
  z.object({ id: z.string().max(60), type: z.literal("text"), text: z.string().max(20000) }),
  z.object({
    id: z.string().max(60),
    type: z.literal("image"),
    path: z.string().max(500),
    caption: z.string().max(300).optional(),
  }),
]);

export type NoteBlock = z.infer<typeof blockSchema>;

/** Sections (lesson pages) inside one unit, newest plan order first. */
export const listSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ unitId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("unit_sections")
      .select(
        "id, unit_id, class_id, title, position, notes_blocks, notes_text, ai_summary, ai_summary_updated_at, material_id, updated_at",
      )
      .eq("unit_id", data.unitId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      ...row,
      notes_blocks: Array.isArray(row.notes_blocks) ? (row.notes_blocks as NoteBlock[]) : [],
    }));
  });

export const createSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ unitId: z.string().uuid(), title: z.string().min(1).max(160) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const classId = await assertUnitTeacher(supabase, data.unitId, userId);
    const { count } = await supabase
      .from("unit_sections")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", data.unitId);

    const { data: section, error } = await supabase
      .from("unit_sections")
      .insert({
        unit_id: data.unitId,
        class_id: classId,
        title: data.title,
        position: count ?? 0,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return section;
  });

export const updateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sectionId: z.string().uuid(),
        title: z.string().min(1).max(160).optional(),
        materialId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: section } = await supabase
      .from("unit_sections")
      .select("class_id")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (!section) throw new Error("Section not found.");
    await assertClassTeacher(supabase, section.class_id, userId);

    const patch = {
      updated_at: new Date().toISOString(),
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.materialId !== undefined ? { material_id: data.materialId } : {}),
    };

    const { error } = await supabase.from("unit_sections").update(patch).eq("id", data.sectionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: section } = await supabase
      .from("unit_sections")
      .select("class_id")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (!section) throw new Error("Section not found.");
    await assertClassTeacher(supabase, section.class_id, userId);
    const { error } = await supabase.from("unit_sections").delete().eq("id", data.sectionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Teacher-only canvas save. Students never reach this (checked server-side). */
export const saveSectionNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sectionId: z.string().uuid(),
        blocks: z.array(blockSchema).max(400),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: section } = await supabase
      .from("unit_sections")
      .select("class_id")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (!section) throw new Error("Section not found.");
    await assertClassTeacher(supabase, section.class_id, userId);

    const notesText = data.blocks
      .map((block) => (block.type === "text" ? block.text : `[image: ${block.caption ?? "handwritten working"}]`))
      .join("\n")
      .trim();

    const { error } = await supabase
      .from("unit_sections")
      .update({
        notes_blocks: data.blocks,
        notes_text: notesText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.sectionId);
    if (error) throw new Error(error.message);
    return { ok: true, notesText };
  });

/** Regenerates the student-facing AI summary from the teacher's notes only. */
export const generateSectionSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: section } = await supabase
      .from("unit_sections")
      .select("class_id, unit_id, title, notes_text")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (!section) throw new Error("Section not found.");
    await assertClassTeacher(supabase, section.class_id, userId);

    const [{ data: unit }, { data: klass }] = await Promise.all([
      supabase.from("class_units").select("title").eq("id", section.unit_id).maybeSingle(),
      supabase.from("classes").select("subject").eq("id", section.class_id).maybeSingle(),
    ]);

    const summary = await summariseTeacherNotes({
      unitTitle: unit?.title ?? "Unit",
      sectionTitle: section.title,
      subject: klass?.subject ?? "Science",
      notesText: section.notes_text ?? "",
    });

    const { error } = await supabase
      .from("unit_sections")
      .update({ ai_summary: summary || null, ai_summary_updated_at: new Date().toISOString() })
      .eq("id", data.sectionId);
    if (error) throw new Error(error.message);
    return { summary };
  });

/** Short-lived signed URLs for canvas images (class-materials bucket). */
export const signNotePaths = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ paths: z.array(z.string().max(500)).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.paths.length === 0) return {} as Record<string, string>;
    const { data: signed, error } = await context.supabase.storage
      .from("class-materials")
      .createSignedUrls(data.paths, 60 * 60);
    if (error) throw new Error(error.message);
    const map: Record<string, string> = {};
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
    }
    return map;
  });

/** Always-visible lesson tutor. Available to the teacher and to class students. */
export const askLessonTutor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sectionId: z.string().uuid().nullable().optional(),
        classId: z.string().uuid(),
        question: z.string().min(1).max(1200),
        concept: z.string().max(200).nullable().optional(),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
          .max(20)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: klass, error: classError } = await supabase
      .from("classes")
      .select("id, subject, teacher_id")
      .eq("id", data.classId)
      .maybeSingle();
    if (classError) throw new Error(classError.message);
    if (!klass) throw new Error("Class not found.");
    const isTeacher = klass.teacher_id === userId;

    let contextNotes = "";
    let unitTitle = "This class";
    let documentTitle: string | null = null;
    if (data.sectionId) {
      const { data: section } = await supabase
        .from("unit_sections")
        .select("notes_text, ai_summary, unit_id, material_id")
        .eq("id", data.sectionId)
        .maybeSingle();
      if (section) {
        contextNotes = [section.notes_text, section.ai_summary].filter(Boolean).join("\n\n");
        const [{ data: unit }, material] = await Promise.all([
          supabase.from("class_units").select("title").eq("id", section.unit_id).maybeSingle(),
          section.material_id
            ? supabase
                .from("unit_materials")
                .select("title")
                .eq("id", section.material_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        unitTitle = unit?.title ?? unitTitle;
        documentTitle = (material?.data as { title?: string } | null)?.title ?? null;
      }
    }

    const settings = await effectiveTutorSettings(
      supabase,
      data.classId,
      isTeacher ? null : userId,
    );

    const reply = await lessonTutorReply({
      question: data.question,
      concept: data.concept ?? null,
      contextNotes,
      documentTitle,
      subject: klass.subject ?? "Science",
      unitTitle,
      language: settings.language,
      level: settings.level,
      isTeacher,
      history: data.history ?? [],
    });

    return { reply };
  });
