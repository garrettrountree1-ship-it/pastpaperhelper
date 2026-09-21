import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { answerFormativeCore, getActiveFormativeCore } from "@/lib/formative.functions";
import { uniqueAlias } from "@/lib/game-alias";

const presentationInput = z.union([
  z.object({ classId: z.string().uuid() }),
  z.object({ code: z.string().trim().min(4).max(10) }),
]);

const publicMirrorInput = z.object({
  code: z.string().trim().min(4).max(10),
  name: z.string().trim().min(2).max(80),
  /** Returned on a previous join; lets the same browser reclaim its seat. */
  claimToken: z.string().min(20).optional(),
});

/** A mirror seat goes free this long after the viewer's tab closes. */
const CLAIM_TTL_MS = 60_000;

async function resolveClaim(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: claim } = await supabaseAdmin
    .from("mirror_claims")
    .select("id, class_id, student_id, last_seen_at")
    .eq("token", token)
    .maybeSingle();
  if (!claim) {
    throw new Error("Your mirror seat expired. Join again with the class code and your name.");
  }
  await supabaseAdmin
    .from("mirror_claims")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", claim.id);
  return { db: supabaseAdmin, classId: claim.class_id as string, studentId: claim.student_id as string };
}

/**
 * Name-and-code join for the dedicated class mirror. No account and no
 * anonymous sign-in: the server checks the roster, hands back a claim token,
 * and records that student's formative answers under their roster identity.
 */
export const joinPublicMirror = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publicMirrorInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: klass } = await supabaseAdmin
      .from("classes")
      .select("id, name, join_code, teacher_id")
      .eq("join_code", data.code.toUpperCase())
      .maybeSingle();
    if (!klass) throw new Error("That class code was not found.");

    const { data: members } = await supabaseAdmin
      .from("class_members")
      .select("student_id")
      .eq("class_id", klass.id);
    const memberIds = (members ?? []).map((row) => row.student_id as string);
    const { data: profiles } = memberIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name, created_at")
          .in("id", memberIds)
          .order("created_at", { ascending: true })
      : { data: [] };
    const typedName = data.name.trim().toLowerCase();
    const rosterProfile = (profiles ?? []).find(
      (profile) => profile.full_name.trim().toLowerCase() === typedName,
    );
    if (!rosterProfile) {
      throw new Error("Enter your name exactly as it appears on your teacher's class roster.");
    }

    // One viewer per roster name at a time. A seat is held while its tab keeps
    // checking in; once the tab closes, the name is free again after a minute.
    const { data: claim } = await supabaseAdmin
      .from("mirror_claims")
      .select("id, token, last_seen_at")
      .eq("class_id", klass.id)
      .eq("student_id", rosterProfile.id)
      .maybeSingle();
    const claimFresh =
      claim && Date.now() - new Date(claim.last_seen_at as string).getTime() < CLAIM_TTL_MS;
    if (claim && claimFresh && claim.token !== data.claimToken) {
      throw new Error(
        "Someone is already watching this mirror under that roster name. If their tab is closed, try again in a minute.",
      );
    }
    let token: string;
    if (claim && claim.token === data.claimToken) {
      token = claim.token as string;
      await supabaseAdmin
        .from("mirror_claims")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", claim.id);
    } else if (claim) {
      const { data: updated, error } = await supabaseAdmin
        .from("mirror_claims")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", claim.id)
        .select("token")
        .single();
      if (error) throw new Error(error.message);
      // Keep the same token so a rejoining browser retains its seat.
      token = (updated?.token as string | undefined) ?? (claim.token as string);
      if (!updated) token = claim.token as string;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("mirror_claims")
        .insert({ class_id: klass.id, student_id: rosterProfile.id })
        .select("token")
        .single();
      if (error) throw new Error(error.message);
      token = inserted.token as string;
    }

    // Show the roster student's games avatar on the mirror.
    let viewerAlias: string | null = null;
    const { data: rosterGameProfile } = await supabaseAdmin
      .from("game_profiles")
      .select("alias")
      .eq("class_id", klass.id)
      .eq("student_id", rosterProfile.id)
      .maybeSingle();
    if (rosterGameProfile?.alias) {
      viewerAlias = rosterGameProfile.alias as string;
    } else {
      const { data: aliases } = await supabaseAdmin
        .from("game_profiles")
        .select("alias")
        .eq("class_id", klass.id);
      const alias = uniqueAlias(new Set((aliases ?? []).map((row) => row.alias as string)));
      await supabaseAdmin
        .from("game_profiles")
        .insert({ class_id: klass.id, student_id: rosterProfile.id, alias });
      viewerAlias = alias;
    }

    const { data: coteachers } = await supabaseAdmin
      .from("class_coteachers")
      .select("teacher_id")
      .eq("class_id", klass.id);

    return {
      classId: klass.id as string,
      className: klass.name as string,
      code: klass.join_code as string,
      studentName: rosterProfile.full_name as string,
      alias: viewerAlias,
      claimToken: token,
      presenterIds: [
        klass.teacher_id as string,
        ...(coteachers ?? []).map((row) => row.teacher_id as string),
      ],
    };
  });

/** Keeps a mirror seat warm; the panel's polling also does this implicitly. */
export const mirrorHeartbeat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ claimToken: z.string().min(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    await resolveClaim(data.claimToken);
    return { ok: true };
  });

/** The live formative check for a mirror viewer, answered as the roster student. */
export const mirrorGetActiveCheck = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ claimToken: z.string().min(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { db, classId, studentId } = await resolveClaim(data.claimToken);
    return getActiveFormativeCore(db, classId, studentId);
  });

/** A mirror viewer's answer, recorded under their roster name. */
export const mirrorAnswerCheck = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        claimToken: z.string().min(20),
        checkId: z.string().uuid(),
        answer: z.string().min(1).max(4000),
        partAnswers: z.record(z.string(), z.string().max(2000)).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { db, classId, studentId } = await resolveClaim(data.claimToken);
    const { data: check } = await db
      .from("formative_checks")
      .select("id, class_id")
      .eq("id", data.checkId)
      .maybeSingle();
    if (!check || check.class_id !== classId) {
      throw new Error("That class question is no longer available.");
    }
    return answerFormativeCore(db, studentId, {
      checkId: data.checkId,
      answer: data.answer,
      partAnswers: data.partAnswers,
    });
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
