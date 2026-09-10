import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Who is allowed to mirror their presenting screen to a class: the class owner
 * plus any coteacher. Students call this so a classmate cannot pretend to be
 * the teacher and push a fake lesson screen to everyone else.
 */
export const listClassPresenters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: klass, error } = await supabase
      .from("classes")
      .select("id, teacher_id")
      .eq("id", data.classId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!klass) throw new Error("Class not found.");

    const { data: isMember } = await supabase.rpc("is_class_member", {
      _class_id: data.classId,
      _user_id: userId,
    });
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (isMember !== true && isTeacher !== true) throw new Error("You are not in this class.");

    const { data: coteachers } = await supabase
      .from("class_coteachers")
      .select("teacher_id")
      .eq("class_id", data.classId);

    const ids = new Set<string>([klass.teacher_id as string]);
    for (const row of coteachers ?? []) ids.add(row.teacher_id as string);
    return { presenterIds: [...ids] };
  });
