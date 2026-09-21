import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { answerFormativeCore, getActiveFormativeCore } from "@/lib/formative.functions";

const presentationInput = z.union([
  z.object({ classId: z.string().uuid() }),
  z.object({ code: z.string().trim().min(4).max(10) }),
]);

const publicMirrorInput = z.object({
  code: z.string().trim().min(4).max(10),
  name: z.string().trim().min(2).max(80),
  /** Returning tab reuses its seat token so it does not count as a second join. */
  claimToken: z.string().min(20).optional(),
});

const claimInput = z.object({ claimToken: z.string().min(20) });

const mirrorAnswerInput = z.object({
  claimToken: z.string().min(20),
  checkId: z.string().uuid(),
  answer: z.string().min(1).max(4000),
  partAnswers: z.record(z.string(), z.string().max(2000)).optional(),
});

/** A mirror seat expires after this much silence so a closed tab frees the name. */
const CLAIM_TTL_MS = 60_000;

type AdminClient = Awaited<
  ReturnType<typeof import("@/integrations/supabase/client.server")>
>["supabaseAdmin"] extends infer T
  ? T
  : never;

async function resolveClaim(claimToken: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: claim } = await supabaseAdmin
    .from("mirror_claims")
    .select("id, class_id, student_id, last_seen_at")
    .eq("token", claimToken)
    .maybeSingle();
  if (!claim) throw new Error("This mirror seat is no longer active. Join again.");
  const fresh = Date.now() - new Date(claim.last_seen_at as string).getTime() < CLAIM_TTL_MS * 2;
  if (!fresh) throw new Error("This mirror seat expired. Join again to continue.");
  await supabaseAdmin
    .from("mirror_claims")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", claim.id);
  return {
    supabaseAdmin: supabaseAdmin as unknown as Parameters<typeof getActiveFormativeCore>[0],
    classId: claim.class_id as string,
    studentId: claim.student_id as string,
  };
}

/**
 * Name-based, sign-in-free join for the dedicated class mirror. The server
 * checks the roster, then issues (or reuses) one seat token per roster name.
 * While that seat is alive, nobody else can claim the same name; once the tab
 * stops checking in, the name becomes available again after about a minute.
 * Formative answers are saved under the real roster student.
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
      ? await supabaseAdmin.from("profiles").select("id, full_name, created_at").in("id", memberIds)
      : { data: [] };
    const matches = (profiles ?? []).filter(
      (profile) => profile.full_name.trim().toLowerCase() === data.name.toLowerCase(),
    );
    // Earliest enrolled profile wins when a name appears twice on the roster.
    matches.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const rosterProfile = matches[0];
    if (!rosterProfile) {
      throw new Error("Enter your name exactly as it appears on your teacher's class roster.");
    }

    const { data: existingClaim } = await supabaseAdmin
      .from("mirror_claims")
      .select("id, token, last_seen_at")
      .eq("class_id", klass.id)
      .eq("student_id", rosterProfile.id)
      .maybeSingle();

    let claimToken: string;
    if (existingClaim) {
      const fresh =
        Date.now() - new Date(existingClaim.last_seen_at as string).getTime() < CLAIM_TTL_MS;
      const sameTab = data.claimToken && data.claimToken === existingClaim.token;
      if (fresh && !sameTab) {
        throw new Error(
          `${rosterProfile.full_name} is already watching this class mirror. If that was you, rejoin from the same tab or try again in about a minute.`,
        );
      }
      const { error } = await supabaseAdmin
        .from("mirror_claims")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", existingClaim.id);
      if (error) throw new Error(error.message);
      claimToken = existingClaim.token as string;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("mirror_claims")
        .insert({ class_id: klass.id, student_id: rosterProfile.id })
        .select("token")
        .single();
      if (error || !inserted) {
        throw new Error(error?.message ?? "Could not reserve your mirror seat. Try again.");
      }
      claimToken = inserted.token as string;
    }

    const { data: rosterGameProfile } = await supabaseAdmin
      .from("game_profiles")
      .select("alias")
      .eq("class_id", klass.id)
      .eq("student_id", rosterProfile.id)
      .maybeSingle();

    const { data: coteachers } = await supabaseAdmin
      .from("class_coteachers")
      .select("teacher_id")
      .eq("class_id", klass.id);

    return {
      classId: klass.id as string,
      className: klass.name as string,
      code: klass.join_code as string,
      studentName: rosterProfile.full_name as string,
      alias: (rosterGameProfile?.alias as string | undefined) ?? null,
      claimToken,
      presenterIds: [
        klass.teacher_id as string,
        ...(coteachers ?? []).map((row) => row.teacher_id as string),
      ],
    };
  });

/** Keeps a mirror seat alive; the page calls this every 20 seconds. */
export const mirrorHeartbeat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => claimInput.parse(input))
  .handler(async ({ data }) => {
    const claim = await resolveClaim(data.claimToken);
    return { ok: true as const, classId: claim.classId };
  });

/** The live class question for a mirror seat, marked under the roster name. */
export const mirrorGetActiveCheck = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => claimInput.parse(input))
  .handler(async ({ data }) => {
    const claim = await resolveClaim(data.claimToken);
    return getActiveFormativeCore(claim.supabaseAdmin, claim.classId, claim.studentId);
  });

/** A mirror seat's answer, recorded against the roster student. */
export const mirrorAnswerCheck = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => mirrorAnswerInput.parse(input))
  .handler(async ({ data }) => {
    const claim = await resolveClaim(data.claimToken);
    const { claimToken: _claimToken, ...answer } = data;
    return answerFormativeCore(claim.supabaseAdmin, claim.studentId, answer);
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
