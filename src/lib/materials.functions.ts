import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertClassTeacher,
  assertMaterialTeacher,
  assertUnitTeacher,
} from "@/lib/materials.server";
import { teachesClass, teachingClassIds } from "@/lib/teach-access";

export const MATERIAL_KINDS = ["slides", "video", "document", "image", "link"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Classes the signed-in user can see materials for, plus whether they own them. */
export const listMaterialClasses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: taught }, { data: memberships }] = await Promise.all([
      supabase
        .from("classes")
        .select("id, name, subject, curriculum, join_code")
        .in("id", await teachingClassIds(supabase, userId))
        .order("created_at", { ascending: false }),
      supabase.from("class_members").select("class_id").eq("student_id", userId),
    ]);

    const memberIds = (memberships ?? []).map((m) => m.class_id);
    let joined: Array<{ id: string; name: string; subject: string; curriculum: string }> = [];
    if (memberIds.length > 0) {
      const { data } = await supabase
        .from("classes")
        .select("id, name, subject, curriculum")
        .in("id", memberIds);
      joined = data ?? [];
    }

    const taughtIds = new Set((taught ?? []).map((c) => c.id));
    return [
      ...(taught ?? []).map(({ join_code, ...c }) => ({
        ...c,
        joinCode: join_code as string,
        canManage: true,
      })),
      ...joined
        .filter((c) => !taughtIds.has(c.id))
        .map((c) => ({ ...c, joinCode: null as string | null, canManage: false })),
    ];

  });

/** Units and their materials for one class. */
export const listUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: units, error } = await supabase
      .from("class_units")
      .select(
        "id, title, description, position, created_at, planned_start, planned_end, planned_classes, archived_at",
      )
      .eq("class_id", data.classId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const unitIds = (units ?? []).map((u) => u.id);
    let materials: Array<{
      id: string;
      unit_id: string;
      title: string;
      kind: string;
      storage_path: string | null;
      external_url: string | null;
      file_name: string | null;
      file_size: number | null;
      content_type: string | null;
      allow_download: boolean;
      created_at: string;
    }> = [];
    if (unitIds.length > 0) {
      const { data: rows, error: materialError } = await supabase
        .from("unit_materials")
        .select(
          "id, unit_id, title, kind, storage_path, external_url, file_name, file_size, content_type, allow_download, created_at",
        )
        .in("unit_id", unitIds)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (materialError) throw new Error(materialError.message);
      materials = rows ?? [];
    }

    return (units ?? []).map((unit) => ({
      ...unit,
      materials: materials.filter((m) => m.unit_id === unit.id),
    }));
  });

export const createUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        title: z.string().min(1).max(120),
        description: z.string().max(1000).optional(),
        plannedStart: z.string().max(20).nullable().optional(),
        plannedEnd: z.string().max(20).nullable().optional(),
        plannedClasses: z.number().int().min(0).max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClassTeacher(supabase, data.classId, userId);
    const { count } = await supabase
      .from("class_units")
      .select("id", { count: "exact", head: true })
      .eq("class_id", data.classId);

    const { data: unit, error } = await supabase
      .from("class_units")
      .insert({
        class_id: data.classId,
        title: data.title,
        description: data.description ?? null,
        planned_start: data.plannedStart || null,
        planned_end: data.plannedEnd || null,
        planned_classes: data.plannedClasses ?? null,
        position: count ?? 0,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return unit;
  });

export const updateUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        unitId: z.string().uuid(),
        title: z.string().min(1).max(120),
        description: z.string().max(1000).optional(),
        plannedStart: z.string().max(20).nullable().optional(),
        plannedEnd: z.string().max(20).nullable().optional(),
        plannedClasses: z.number().int().min(0).max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertUnitTeacher(context.supabase, data.unitId, context.userId);
    const { error } = await context.supabase
      .from("class_units")
      .update({
        title: data.title,
        description: data.description ?? null,
        planned_start: data.plannedStart || null,
        planned_end: data.plannedEnd || null,
        planned_classes: data.plannedClasses ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.unitId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ unitId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertUnitTeacher(supabase, data.unitId, userId);
    const { data: files } = await supabase
      .from("unit_materials")
      .select("storage_path")
      .eq("unit_id", data.unitId);

    const paths = (files ?? []).map((f) => f.storage_path).filter((p): p is string => Boolean(p));
    if (paths.length > 0) await supabase.storage.from("class-materials").remove(paths);

    const { error } = await supabase.from("class_units").delete().eq("id", data.unitId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Records a material row after the browser has uploaded the file to storage. */
export const addMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        unitId: z.string().uuid(),
        classId: z.string().uuid(),
        title: z.string().min(1).max(200),
        kind: z.enum(MATERIAL_KINDS),
        storagePath: z.string().max(500).optional(),
        externalUrl: z.string().url().max(1000).optional(),
        fileName: z.string().max(300).optional(),
        fileSize: z.number().int().nonnegative().optional(),
        contentType: z.string().max(200).optional(),
      })
      .refine((value) => Boolean(value.storagePath || value.externalUrl), {
        message: "A file or a link is required.",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClassTeacher(supabase, data.classId, userId);

    if (data.storagePath && !data.storagePath.startsWith(`${data.classId}/`)) {
      throw new Error("Invalid upload path.");
    }

    const { count } = await supabase
      .from("unit_materials")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", data.unitId);

    const { data: material, error } = await supabase
      .from("unit_materials")
      .insert({
        unit_id: data.unitId,
        class_id: data.classId,
        title: data.title,
        kind: data.kind,
        storage_path: data.storagePath ?? null,
        external_url: data.externalUrl ?? null,
        file_name: data.fileName ?? null,
        file_size: data.fileSize ?? null,
        content_type: data.contentType ?? null,
        position: count ?? 0,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return material;
  });

export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ materialId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMaterialTeacher(supabase, data.materialId, userId);
    const { data: material } = await supabase
      .from("unit_materials")
      .select("storage_path")
      .eq("id", data.materialId)
      .maybeSingle();

    if (material?.storage_path) {
      await supabase.storage.from("class-materials").remove([material.storage_path]);
    }
    const { error } = await supabase.from("unit_materials").delete().eq("id", data.materialId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Short-lived signed URL so class members can view or download a file. */
export const getMaterialUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ materialId: z.string().uuid(), download: z.boolean().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: material, error } = await supabase
      .from("unit_materials")
      .select("storage_path, external_url, file_name, allow_download, class_id")
      .eq("id", data.materialId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!material) throw new Error("Material not found.");

    if (data.download && material.allow_download === false) {
      const teaches = await teachesClass(supabase, material.class_id, context.userId);
      if (!teaches) {
        throw new Error("Downloads are turned off for this resource.");
      }
    }

    if (material.external_url) return { url: material.external_url };
    if (!material.storage_path) throw new Error("Nothing to open.");

    const { data: signed, error: signError } = await supabase.storage
      .from("class-materials")
      .createSignedUrl(
        material.storage_path,
        60 * 30,
        data.download ? { download: material.file_name ?? true } : undefined,
      );
    if (signError || !signed) throw new Error(signError?.message ?? "Could not open this file.");
    return { url: signed.signedUrl };
  });

/**
 * Prepared slide/document renders are stored next to the original file, so the
 * heavy work happens once (on upload) and every later viewer just downloads the
 * finished render instead of parsing the file again.
 */
const RENDER_VERSION = "v4";
const renderPath = (storagePath: string) => `${storagePath}.render-${RENDER_VERSION}.json`;

/** Signed URL for a shared prepared render, or null when none exists yet. */
export const getMaterialRenderUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ materialId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: material } = await supabase
      .from("unit_materials")
      .select("storage_path")
      .eq("id", data.materialId)
      .maybeSingle();
    if (!material?.storage_path) return { url: null };

    const { data: signed } = await supabase.storage
      .from("class-materials")
      .createSignedUrl(renderPath(material.storage_path), 60 * 30);
    return { url: signed?.signedUrl ?? null };
  });

/** Teacher-only upload ticket for storing a prepared render. */
export const createMaterialRenderUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ materialId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMaterialTeacher(supabase, data.materialId, userId);
    const { data: material } = await supabase
      .from("unit_materials")
      .select("storage_path")
      .eq("id", data.materialId)
      .maybeSingle();
    if (!material?.storage_path) throw new Error("This resource has no stored file.");

    const path = renderPath(material.storage_path);
    const { data: ticket, error } = await supabase.storage
      .from("class-materials")
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !ticket) throw new Error(error?.message ?? "Could not prepare the render upload.");
    return { path, token: ticket.token };
  });

/** Teacher toggle: allow or block student downloads of one resource. */
export const setMaterialDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ materialId: z.string().uuid(), allow: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMaterialTeacher(supabase, data.materialId, userId);
    const { error } = await supabase
      .from("unit_materials")
      .update({ allow_download: data.allow })
      .eq("id", data.materialId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Students joined to one class — teacher only. */
export const listClassRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClassTeacher(supabase, data.classId, userId);

    const { data: members } = await supabase
      .from("class_members")
      .select("student_id, joined_at")
      .eq("class_id", data.classId)
      .order("joined_at", { ascending: true });

    const ids = (members ?? []).map((m) => m.student_id);
    if (ids.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);

    return (members ?? []).map((m) => {
      const p = (profiles ?? []).find((row) => row.id === m.student_id);
      return {
        id: m.student_id,
        name: p?.full_name ?? "Student",
        email: p?.email ?? null,
        joinedAt: m.joined_at as string,
      };
    });
  });
