import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminEmail } from "@/lib/admin";
import { SECTIONS } from "@/lib/sections";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function requireAdmin(context: { supabase: { auth: { getUser: () => Promise<any> } } }) {
  const { data } = await context.supabase.auth.getUser();
  const email = data?.user?.email as string | undefined;
  if (!isAdminEmail(email)) throw new Error("Admin access only.");
  return email!;
}

export const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.auth.getUser();
    return { isAdmin: isAdminEmail(data.user?.email) };
  });

/** Any signed-in user can log their own time in a section. */
export const recordActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        section: z.string().min(1).max(40),
        seconds: z.number().int().min(1).max(60 * 60 * 4),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("activity_events")
      .insert({ user_id: userId, section: data.section, seconds: data.seconds });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendSupportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ body: z.string().min(4).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from("support_messages").insert({
      user_id: userId,
      email: user.user?.email ?? "",
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMySupportMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("support_messages")
      .select("id, body, reply, created_at, replied_at")
      .order("created_at", { ascending: false })
      .limit(20);
    return data ?? [];
  });

/** Platform owner dashboard: accounts, email list and time spent per section. */
export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const db = await admin();

    const [{ data: profiles }, { data: roles }, { data: events }, { data: classes }, { data: members }] =
      await Promise.all([
        db.from("profiles").select("id, full_name, email, created_at").order("created_at", {
          ascending: false,
        }),
        db.from("user_roles").select("user_id, role"),
        db.from("activity_events").select("user_id, section, seconds, occurred_at"),
        db.from("classes").select("id, name, teacher_id, created_at"),
        db.from("class_members").select("class_id, student_id"),
      ]);

    const roleFor = (id: string) =>
      (roles ?? []).some((r) => r.user_id === id && r.role === "teacher") ? "teacher" : "student";

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const sectionTotals = SECTIONS.map((section) => {
      const rows = (events ?? []).filter((e) => e.section === section.key);
      return {
        section: section.key,
        label: section.label,
        totalSeconds: rows.reduce((sum, e) => sum + e.seconds, 0),
        weekSeconds: rows
          .filter((e) => new Date(e.occurred_at).getTime() >= weekAgo)
          .reduce((sum, e) => sum + e.seconds, 0),
        users: new Set(rows.map((e) => e.user_id)).size,
      };
    });

    const users = (profiles ?? []).map((p) => {
      const rows = (events ?? []).filter((e) => e.user_id === p.id);
      return {
        id: p.id,
        name: p.full_name,
        email: p.email ?? "",
        role: roleFor(p.id),
        createdAt: p.created_at,
        totalSeconds: rows.reduce((sum, e) => sum + e.seconds, 0),
        activeToday: rows.some((e) => new Date(e.occurred_at).getTime() >= dayAgo),
      };
    });

    const { data: support } = await db
      .from("support_messages")
      .select("id, user_id, email, body, reply, created_at, replied_at")
      .order("created_at", { ascending: false })
      .limit(100);

    return {
      counts: {
        users: users.length,
        teachers: users.filter((u) => u.role === "teacher").length,
        students: users.filter((u) => u.role === "student").length,
        classes: (classes ?? []).length,
        enrolments: (members ?? []).length,
        activeToday: users.filter((u) => u.activeToday).length,
      },
      users,
      sectionTotals,
      support: (support ?? []).map((row) => ({
        id: row.id,
        email: row.email,
        body: row.body,
        reply: row.reply,
        createdAt: row.created_at,
        repliedAt: row.replied_at,
      })),
    };
  });

export const replySupportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), reply: z.string().min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const db = await admin();
    const { error } = await db
      .from("support_messages")
      .update({ reply: data.reply, replied_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
