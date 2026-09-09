import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IbLevel = "SL" | "HL";

/** True when a question tag marks it as Higher Level only. */
export function isHigherLevelTag(tag: string | null | undefined): boolean {
  return (tag ?? "").trim().toUpperCase() === "HL";
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Teacher-only: SL/HL level per student for a class. */
export const listIbLevels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("You don't teach this class.");

    const db = await admin();
    const { data: rows } = await db
      .from("class_student_settings")
      .select("student_id, ib_level")
      .eq("class_id", data.classId);

    const levels: Record<string, IbLevel> = {};
    for (const row of rows ?? []) {
      const level = (row as { ib_level: string | null }).ib_level;
      if (level === "SL" || level === "HL") levels[row.student_id] = level;
    }
    return { levels };
  });

/** Teacher-only: set a student's SL/HL level for a class. */
export const setIbLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        studentId: z.string().uuid(),
        level: z.enum(["SL", "HL"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("You don't teach this class.");

    const db = await admin();
    const { data: existing } = await db
      .from("class_student_settings")
      .select("id")
      .eq("class_id", data.classId)
      .eq("student_id", data.studentId)
      .maybeSingle();

    if (existing) {
      await db
        .from("class_student_settings")
        .update({ ib_level: data.level, updated_by: userId })
        .eq("id", existing.id);
    } else {
      await db.from("class_student_settings").insert({
        class_id: data.classId,
        student_id: data.studentId,
        ib_level: data.level,
        updated_by: userId,
      });
    }
    return { ok: true, level: data.level };
  });
