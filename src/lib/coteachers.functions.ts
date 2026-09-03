import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Only the class owner may change who teaches the class. */
async function assertOwner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  classId: string,
  userId: string,
) {
  const { data: klass, error } = await supabase
    .from("classes")
    .select("id, teacher_id")
    .eq("id", classId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!klass || klass.teacher_id !== userId) {
    throw new Error("Only the teacher who created this class can manage coteachers.");
  }
}

/** Owner + coteachers of a class, for the class settings list. */
export const listCoteachers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canTeach } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this class.");

    const db = await admin();
    const [{ data: klass }, { data: rows }] = await Promise.all([
      db.from("classes").select("teacher_id").eq("id", data.classId).maybeSingle(),
      db
        .from("class_coteachers")
        .select("id, teacher_id, created_at")
        .eq("class_id", data.classId)
        .order("created_at", { ascending: true }),
    ]);

    const ids = [klass?.teacher_id, ...(rows ?? []).map((r) => r.teacher_id)].filter(
      (v): v is string => Boolean(v),
    );
    const { data: profiles } = await db
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const nameOf = (id: string) => {
      const p = (profiles ?? []).find((x) => x.id === id);
      return {
        name: p?.full_name?.trim() || p?.email || "Teacher",
        email: p?.email ?? null,
      };
    };

    return {
      isOwner: klass?.teacher_id === userId,
      owner: klass?.teacher_id
        ? { id: klass.teacher_id, ...nameOf(klass.teacher_id) }
        : null,
      coteachers: (rows ?? []).map((r) => ({
        id: r.id,
        teacherId: r.teacher_id,
        addedAt: r.created_at,
        ...nameOf(r.teacher_id),
      })),
    };
  });

/** Owner invites an existing account to coteach by email. */
export const addCoteacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ classId: z.string().uuid(), email: z.string().trim().email() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, data.classId, userId);

    const email = data.email.toLowerCase();
    const db = await admin();
    const { data: profile } = await db
      .from("profiles")
      .select("id, full_name, email")
      .ilike("email", email)
      .maybeSingle();
    if (!profile) {
      throw new Error(
        "No account uses that email yet. Ask them to create an account first, then add them.",
      );
    }
    if (profile.id === userId) throw new Error("You already teach this class.");

    // Coteachers need the teacher role so teacher screens open for them.
    await db
      .from("user_roles")
      .upsert({ user_id: profile.id, role: "teacher" }, { onConflict: "user_id,role" });

    const { error } = await db
      .from("class_coteachers")
      .upsert(
        { class_id: data.classId, teacher_id: profile.id, added_by: userId },
        { onConflict: "class_id,teacher_id" },
      );
    if (error) throw new Error(error.message);

    return { ok: true, name: profile.full_name?.trim() || profile.email };
  });

/** Owner removes a coteacher. */
export const removeCoteacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ classId: z.string().uuid(), teacherId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, data.classId, userId);

    const db = await admin();
    const { error } = await db
      .from("class_coteachers")
      .delete()
      .eq("class_id", data.classId)
      .eq("teacher_id", data.teacherId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
