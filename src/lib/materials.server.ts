import type { SupabaseClient } from "@supabase/supabase-js";

/** Throws unless the signed-in user owns (teaches) the class. Students are read-only. */
export async function assertClassTeacher(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  classId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Only the class teacher can change class materials.");
}

/** Resolves a unit's class then checks teacher ownership. */
export async function assertUnitTeacher(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  unitId: string,
  userId: string,
) {
  const { data: unit } = await supabase
    .from("class_units")
    .select("class_id")
    .eq("id", unitId)
    .maybeSingle();
  if (!unit) throw new Error("Unit not found.");
  await assertClassTeacher(supabase, unit.class_id, userId);
  return unit.class_id as string;
}

/** Resolves a material's class then checks teacher ownership. */
export async function assertMaterialTeacher(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  materialId: string,
  userId: string,
) {
  const { data: material } = await supabase
    .from("unit_materials")
    .select("class_id")
    .eq("id", materialId)
    .maybeSingle();
  if (!material) throw new Error("Material not found.");
  await assertClassTeacher(supabase, material.class_id, userId);
}
