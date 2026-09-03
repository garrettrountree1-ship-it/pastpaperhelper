import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Teaching access = the class owner OR a coteacher the owner invited.
 * These helpers keep every server function agreeing on that definition
 * instead of comparing `classes.teacher_id` directly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** True when the user owns the class or is a coteacher on it. */
export async function teachesClass(supabase: Db, classId: string, userId: string) {
  const { data } = await supabase.rpc("is_class_teacher", {
    _class_id: classId,
    _user_id: userId,
  });
  return data === true;
}

/** Throws a friendly error unless the user teaches (owns or coteaches) the class. */
export async function assertTeachesClass(
  supabase: Db,
  classId: string,
  userId: string,
  message = "You do not teach this class.",
) {
  if (!(await teachesClass(supabase, classId, userId))) throw new Error(message);
}

/** Class ids the user teaches: owned classes plus coteacher invitations. */
export async function teachingClassIds(supabase: Db, userId: string) {
  const [{ data: owned }, { data: coteach }] = await Promise.all([
    supabase.from("classes").select("id").eq("teacher_id", userId),
    supabase.from("class_coteachers").select("class_id").eq("teacher_id", userId),
  ]);
  const ids = new Set<string>();
  for (const c of owned ?? []) ids.add(c.id as string);
  for (const c of coteach ?? []) ids.add(c.class_id as string);
  return [...ids];
}
