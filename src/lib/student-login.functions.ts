import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { assertClassTeacher } from "@/lib/materials.server";

const input = z.object({ classId: z.string().uuid() });

function readablePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((value) => chars[value % chars.length]).join("");
}

function usernameStem(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.|\.$/g, "")
      .slice(0, 24) || "student"
  );
}

async function uniqueUsername(db: SupabaseClient<Database>, name: string) {
  const stem = usernameStem(name);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = String((crypto.getRandomValues(new Uint16Array(1))[0] ?? 0) % 10000).padStart(
      4,
      "0",
    );
    const username = `${stem}.${suffix}`;
    const { count } = await db
      .from("managed_student_credentials")
      .select("id", { count: "exact", head: true })
      .eq("username", username);
    if (!count) return username;
  }
  throw new Error("Could not generate a unique username. Please try again.");
}

export const listManagedStudentLogins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => input.parse(value))
  .handler(async ({ data, context }) => {
    await assertClassTeacher(context.supabase, data.classId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("managed_student_credentials")
      .select("student_id, username, temporary_password")
      .eq("class_id", data.classId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      studentId: row.student_id as string,
      username: row.username as string,
      password: row.temporary_password as string | null,
    }));
  });

export const provisionManagedStudentLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        studentId: z.string().uuid(),
        studentName: z.string().trim().min(1).max(80),
      })
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    await assertClassTeacher(context.supabase, data.classId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: membership } = await supabaseAdmin
      .from("class_members")
      .select("student_id")
      .eq("class_id", data.classId)
      .eq("student_id", data.studentId)
      .maybeSingle();
    if (!membership) throw new Error("This student is not in the class.");
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("managed_student_credentials")
      .select("username, temporary_password")
      .eq("class_id", data.classId)
      .eq("student_id", data.studentId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return { username: existing.username, password: existing.temporary_password };
    const username = await uniqueUsername(supabaseAdmin, data.studentName);
    const { error } = await supabaseAdmin.from("managed_student_credentials").insert({
      class_id: data.classId,
      student_id: data.studentId,
      username,
      temporary_password: null,
    });
    if (error) throw new Error(error.message);
    return { username, password: null };
  });

/** Resolve a non-secret login alias without exposing it in the public UI. */
export const resolveManagedStudentUsername = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z.object({ username: z.string().trim().toLowerCase().min(3).max(40) }).parse(value),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: credential } = await supabaseAdmin
      .from("managed_student_credentials")
      .select("student_id")
      .eq("username", data.username)
      .maybeSingle();
    if (!credential) return { email: null };
    const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(credential.student_id);
    if (error) throw new Error("Unable to sign in with that username.");
    return { email: user.user?.email ?? null };
  });

export const createManagedStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ classId: z.string().uuid(), name: z.string().trim().min(2).max(80) }).parse(value),
  )
  .handler(async ({ data, context }) => {
    await assertClassTeacher(context.supabase, data.classId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = await uniqueUsername(supabaseAdmin, data.name);
    const password = readablePassword();
    const email = `${username}@student.pastpaperhelper.local`;
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.name, role: "student", managed_username: username },
    });
    if (createError || !created.user)
      throw new Error(createError?.message ?? "Could not add student.");
    const studentId = created.user.id;
    const [{ error: profileError }, { error: memberError }, { error: credentialError }] =
      await Promise.all([
        supabaseAdmin.from("profiles").upsert({ id: studentId, full_name: data.name, email }),
        supabaseAdmin
          .from("class_members")
          .insert({ class_id: data.classId, student_id: studentId }),
        supabaseAdmin.from("managed_student_credentials").insert({
          class_id: data.classId,
          student_id: studentId,
          username,
          temporary_password: password,
        }),
      ]);
    const error = profileError ?? memberError ?? credentialError;
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(studentId);
      throw new Error(error.message);
    }
    return { studentId, username, password };
  });

export const resetManagedStudentPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ classId: z.string().uuid(), studentId: z.string().uuid() }).parse(value),
  )
  .handler(async ({ data, context }) => {
    await assertClassTeacher(context.supabase, data.classId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: credential } = await supabaseAdmin
      .from("managed_student_credentials")
      .select("id")
      .eq("class_id", data.classId)
      .eq("student_id", data.studentId)
      .maybeSingle();
    if (!credential) throw new Error("This student does not have a teacher-created login.");
    const password = readablePassword();
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.studentId, {
      password,
    });
    if (authError) throw new Error(authError.message);
    const { error } = await supabaseAdmin
      .from("managed_student_credentials")
      .update({ temporary_password: password, updated_at: new Date().toISOString() })
      .eq("id", credential.id);
    if (error) throw new Error(error.message);
    return { password };
  });
