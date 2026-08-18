import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GAME_KEYS } from "@/lib/game-catalog";

const classInput = z.object({ classId: z.string().uuid() });

/** Teacher-only: which games are on for this class plus every student's game record. */
export const getClassGameRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => classInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isTeacher } = await context.supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: context.userId,
    });
    if (!isTeacher) throw new Error("Only the class teacher can view the game record.");
    const { loadClassGameRecord, readGameSettings } = await import("./game-admin.server");
    const [students, settings] = await Promise.all([
      loadClassGameRecord(data.classId),
      readGameSettings(data.classId),
    ]);
    return { students, settings };
  });

export const setClassGameEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    classInput
      .extend({ gameKey: z.enum(GAME_KEYS), enabled: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isTeacher } = await context.supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: context.userId,
    });
    if (!isTeacher) throw new Error("Only the class teacher can change the games.");
    const { writeGameSetting } = await import("./game-admin.server");
    return writeGameSetting({ ...data, teacherId: context.userId });
  });
