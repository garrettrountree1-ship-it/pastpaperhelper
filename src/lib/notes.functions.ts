import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { teachesClass } from "@/lib/teach-access";
import { assertClassTeacher, assertUnitTeacher } from "@/lib/materials.server";
import { lessonTutorReply, summariseTeacherNotes } from "@/lib/notes.server";
import { effectiveTutorSettings } from "@/lib/tutor-settings.server";

const documentWorkSchema = z.record(z.string(), z.unknown()).superRefine((value, context) => {
  if (JSON.stringify(value).length > 12_000_000) {
    context.addIssue({ code: "custom", message: "Document work is too large to save." });
  }
});

const blockSchema = z.union([
  z.object({
    id: z.string().max(60),
    type: z.literal("text"),
    text: z.string().max(20000),
    // Inline formatting (bold / italic / underline on selected words).
    html: z.string().max(60000).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().optional(),
    size: z.number().min(8).max(96).optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    color: z.string().max(30).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    box: z.boolean().optional(),
  }),

  z.object({
    id: z.string().max(60),
    type: z.literal("image"),
    path: z.string().max(500),
    caption: z.string().max(300).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().optional(),
    h: z.number().optional(),
    rot: z.number().min(-360).max(360).optional(),
  }),
  z.object({
    id: z.string().max(60),
    type: z.literal("ink"),
    d: z.string().max(40000),
    color: z.string().max(30),
    width: z.number(),
    bottom: z.number().optional(),
    /** Highlighter marks are wide and translucent. */
    highlight: z.boolean().optional(),
  }),
  // Teacher voice note: a small speaker pin students can replay.
  z.object({
    id: z.string().max(60),
    type: z.literal("audio"),
    path: z.string().max(500),
    label: z.string().max(200).optional(),
    seconds: z.number().min(0).max(3600).optional(),
    transcript: z.string().max(8000).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
]);

export type NoteBlock = z.infer<typeof blockSchema>;

const sectionColumns =
  "id, unit_id, class_id, title, position, notes_blocks, notes_text, document_work, ai_summary, ai_summary_updated_at, material_id, planned_start, planned_end, planned_classes, updated_at";
const legacySectionColumns =
  "id, unit_id, class_id, title, position, notes_blocks, notes_text, ai_summary, ai_summary_updated_at, material_id, planned_start, planned_end, planned_classes, updated_at";

function isMissingDocumentWorkColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("document_work"));
}

/** Sections (lesson pages) inside one unit, newest plan order first. */
export const listSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ unitId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    let { data: rows, error } = await context.supabase
      .from("unit_sections")
      .select(sectionColumns)
      .eq("unit_id", data.unitId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    // Deployments can briefly serve the new application before the database
    // migration has reached PostgREST's schema cache. Do not turn that window
    // into an unusable, permanently-loading lesson workspace: annotations are
    // optional, so load the lesson without them until the column is available.
    if (isMissingDocumentWorkColumn(error)) {
      const legacyResult = await context.supabase
        .from("unit_sections")
        .select(legacySectionColumns)
        .eq("unit_id", data.unitId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      rows = legacyResult.data;
      error = legacyResult.error;
    }
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      ...row,
      document_work: "document_work" in row ? row.document_work : {},
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
        plannedStart: z.string().max(20).nullable().optional(),
        plannedEnd: z.string().max(20).nullable().optional(),
        plannedClasses: z.number().int().min(0).max(200).nullable().optional(),
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
      ...(data.plannedStart !== undefined ? { planned_start: data.plannedStart || null } : {}),
      ...(data.plannedEnd !== undefined ? { planned_end: data.plannedEnd || null } : {}),
      ...(data.plannedClasses !== undefined ? { planned_classes: data.plannedClasses } : {}),
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
      .map((block) =>
        block.type === "text"
          ? block.text
          : block.type === "image"
            ? `[image: ${block.caption ?? "handwritten working"}]`
            : block.type === "audio"
              ? `[voice note: ${block.transcript || block.label || "teacher audio"}]`
              : "",
      )

      .filter(Boolean)
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

/** Saves the teacher's drawing, text boxes, pictures and editable slide text. */
export const saveSectionDocumentWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sectionId: z.string().uuid(),
        materialId: z.string().uuid(),
        work: documentWorkSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: section } = await supabase
      .from("unit_sections")
      .select("class_id, material_id, document_work")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (!section) throw new Error("Section not found.");
    await assertClassTeacher(supabase, section.class_id, userId);
    if (section.material_id !== data.materialId) throw new Error("Document is no longer attached.");

    const current =
      section.document_work &&
      typeof section.document_work === "object" &&
      !Array.isArray(section.document_work)
        ? section.document_work
        : {};
    const previousMaterialWork =
      current[data.materialId] &&
      typeof current[data.materialId] === "object" &&
      !Array.isArray(current[data.materialId])
        ? current[data.materialId]
        : {};
    const { error } = await supabase
      .from("unit_sections")
      .update({
        document_work: {
          ...current,
          [data.materialId]: { ...previousMaterialWork, ...data.work },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.sectionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Regenerates the student-facing AI summary from the whole lesson page: typed
 * notes, canvas pictures, canvas pen drawing, and marks/text added on the
 * attached document (rasterised by the browser and passed in here).
 */
export const generateSectionSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sectionId: z.string().uuid(),
        canvasInk: z.string().max(4_000_000).nullable().optional(),
        docInk: z.array(z.string().max(4_000_000)).max(6).optional(),
        docTexts: z.array(z.string().max(2000)).max(60).optional(),
        documentTitle: z.string().max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: section } = await supabase
      .from("unit_sections")
      .select("class_id, unit_id, title, notes_text, notes_blocks")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (!section) throw new Error("Section not found.");
    await assertClassTeacher(supabase, section.class_id, userId);

    const [{ data: unit }, { data: klass }] = await Promise.all([
      supabase.from("class_units").select("title").eq("id", section.unit_id).maybeSingle(),
      supabase.from("classes").select("subject").eq("id", section.class_id).maybeSingle(),
    ]);

    // Sign the canvas pictures so the model can actually see them.
    const blocks = Array.isArray(section.notes_blocks) ? (section.notes_blocks as NoteBlock[]) : [];
    const paths = blocks
      .filter((block): block is Extract<NoteBlock, { type: "image" }> => block.type === "image")
      .map((block) => block.path)
      .slice(0, 8);
    let canvasImageUrls: string[] = [];
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from("class-materials")
        .createSignedUrls(paths, 60 * 30);
      canvasImageUrls = (signed ?? [])
        .map((item) => item.signedUrl)
        .filter((url): url is string => Boolean(url));
    }

    const summary = await summariseTeacherNotes({
      unitTitle: unit?.title ?? "Unit",
      sectionTitle: section.title,
      subject: klass?.subject ?? "Science",
      notesText: section.notes_text ?? "",
      canvasImageUrls,
      canvasInk: data.canvasInk ?? null,
      docInk: data.docInk ?? [],
      docTexts: data.docTexts ?? [],
      documentTitle: data.documentTitle ?? null,
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
    const isTeacher =
      klass.teacher_id === userId || (await teachesClass(supabase, klass.id, userId));

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

/** Voice-to-text for the lesson canvas (teacher dictation). */
export const transcribeVoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ audioBase64: z.string().min(100).max(8_000_000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { transcribeWav } = await import("@/lib/voice-notes.server");
    const text = await transcribeWav(data.audioBase64);
    return { text };
  });
