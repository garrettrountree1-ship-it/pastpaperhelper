import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { uniqueAlias } from "@/lib/game-alias";
import { answerFormativeCore, getActiveFormativeCore } from "@/lib/formative.functions";

const presentationInput = z.union([
  z.object({ classId: z.string().uuid() }),
  z.object({ code: z.string().trim().min(4).max(10) }),
]);

const publicMirrorInput = z.object({
  code: z.string().trim().min(4).max(10),
  name: z.string().trim().min(2).max(80),
  /** A token this browser already holds, so a reload keeps the same seat. */
  claimToken: z.string().min(10).optional(),
});

/** A claim goes stale when the tab stops checking in. */
const CLAIM_STALE_MINUTES = 3;

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Resolves a mirror claim token to its class and roster student. */
async function resolveClaim(token: string) {
  const db = await adminDb();
  const { data: claim } = await db
    .from("mirror_claims")
    .select("id, class_id, student_id")
    .eq("token", token)
    .maybeSingle();
  if (!claim) throw new Error("This class viewer has expired. Enter the class code again.");
  await db
    .from("mirror_claims")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", claim.id);
  return {
    db,
    classId: claim.class_id as string,
    studentId: claim.student_id as string,
  };
}

/**
 * Lets a student watch the class mirror with nothing but the class code and
 * their roster name. No sign-in and no anonymous account is created, so a
 * student signed into their own account in another tab stays signed in.
 */
export const joinPublicMirror = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publicMirrorInput.parse(input))
  .handler(async ({ data }) => {
    const db = await adminDb();

    const { data: klass } = await db
      .from("classes")
      .select("id, name, join_code, teacher_id")
      .eq("join_code", data.code.toUpperCase())
      .maybeSingle();
    if (!klass) throw new Error("That class code was not found.");

    const { data: members } = await db
      .from("class_members")
      .select("student_id")
      .eq("class_id", klass.id);
    const memberIds = (members ?? []).map((row) => row.student_id as string);
    const { data: profiles } = memberIds.length
      ? await db.from("profiles").select("id, full_name").in("id", memberIds)
      : { data: [] };
    const rosterProfile = (profiles ?? []).find(
      (profile) => profile.full_name.trim().toLowerCase() === data.name.trim().toLowerCase(),
    );
    if (!rosterProfile) {
      throw new Error("Enter your name exactly as it appears on your teacher's class roster.");
    }

    // One live seat per roster name. A stale seat (closed tab) is reclaimed.
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MINUTES * 60_000).toISOString();
    const { data: existing } = await db
      .from("mirror_claims")
      .select("id, token, last_seen_at")
      .eq("class_id", klass.id)
      .eq("student_id", rosterProfile.id)
      .maybeSingle();

    let token = existing?.token as string | undefined;
    const mine = Boolean(data.claimToken && existing?.token === data.claimToken);
    if (existing && !mine && (existing.last_seen_at as string) > staleBefore) {
      throw new Error("Someone is already using this name in the class viewer.");
    }
    if (existing) {
      await db
        .from("mirror_claims")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      const { data: created, error } = await db
        .from("mirror_claims")
        .insert({ class_id: klass.id, student_id: rosterProfile.id })
        .select("token")
        .single();
      if (error) throw new Error(error.message);
      token = created.token as string;
    }

    const { data: gameProfile } = await db
      .from("game_profiles")
      .select("alias")
      .eq("class_id", klass.id)
      .eq("student_id", rosterProfile.id)
      .maybeSingle();
    let alias = (gameProfile?.alias ?? null) as string | null;
    if (!alias) {
      const { data: aliases } = await db
        .from("game_profiles")
        .select("alias")
        .eq("class_id", klass.id);
      alias = uniqueAlias(new Set((aliases ?? []).map((row) => row.alias as string)));
      await db
        .from("game_profiles")
        .insert({ class_id: klass.id, student_id: rosterProfile.id, alias });
    }

    const { data: coteachers } = await db
      .from("class_coteachers")
      .select("teacher_id")
      .eq("class_id", klass.id);

    return {
      classId: klass.id as string,
      className: klass.name as string,
      code: klass.join_code as string,
      studentName: rosterProfile.full_name as string,
      claimToken: token!,
      alias,
      presenterIds: [
        klass.teacher_id as string,
        ...(coteachers ?? []).map((row) => row.teacher_id as string),
      ],
    };
  });

/** Keeps a mirror seat alive while the tab is open. */
export const mirrorHeartbeat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ claimToken: z.string().min(10) }).parse(input))
  .handler(async ({ data }) => {
    await resolveClaim(data.claimToken);
    return { ok: true };
  });

/** The live class question, read for a mirror viewer by their claim token. */
export const mirrorGetActiveCheck = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ claimToken: z.string().min(10) }).parse(input))
  .handler(async ({ data }) => {
    const { db, classId, studentId } = await resolveClaim(data.claimToken);
    return getActiveFormativeCore(db, classId, studentId);
  });

/** A mirror viewer answers the live class question, saved under their name. */
export const mirrorAnswerCheck = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        claimToken: z.string().min(10),
        checkId: z.string().uuid(),
        answer: z.string().min(1).max(4000),
        partAnswers: z.record(z.string(), z.string().max(2000)).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { db, studentId } = await resolveClaim(data.claimToken);
    const { claimToken: _token, ...payload } = data;
    return answerFormativeCore(db, studentId, payload);
  });


/** Resolves the short, keyboard-friendly link used by the dedicated class viewer. */
export const getPresentationClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => presentationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const query = supabase.from("classes").select("id, name, join_code, teacher_id");
    const { data: klass, error } = await (
      "classId" in data
        ? query.eq("id", data.classId)
        : query.eq("join_code", data.code.toUpperCase())
    ).maybeSingle();
    if (error) throw new Error(error.message);
    if (!klass) throw new Error("Presentation code not found.");

    const [{ data: isMember }, { data: isTeacher }, { data: coteachers }] = await Promise.all([
      supabase.rpc("is_class_member", { _class_id: klass.id, _user_id: userId }),
      supabase.rpc("is_class_teacher", { _class_id: klass.id, _user_id: userId }),
      supabase.from("class_coteachers").select("teacher_id").eq("class_id", klass.id),
    ]);
    if (isMember !== true && isTeacher !== true) throw new Error("You are not in this class.");

    return {
      classId: klass.id,
      className: klass.name,
      code: klass.join_code,
      presenterIds: [
        klass.teacher_id as string,
        ...(coteachers ?? []).map((row) => row.teacher_id as string),
      ],
    };
  });

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
