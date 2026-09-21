import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { uniqueAlias } from "@/lib/game-alias";

const presentationInput = z.union([
  z.object({ classId: z.string().uuid() }),
  z.object({ code: z.string().trim().min(4).max(10) }),
]);

const publicMirrorInput = z.object({
  code: z.string().trim().min(4).max(10),
  name: z.string().trim().min(2).max(80),
  accessToken: z.string().min(20),
});

/**
 * Gives a browser-only anonymous Supabase user access to the dedicated mirror.
 * Students identify themselves by their roster name, so formative responses are
 * recorded under that name without requiring a normal account sign-in.
 */
export const joinPublicMirror = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => publicMirrorInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    const guestId = auth.user?.id;
    if (authError || !guestId) {
      throw new Error("Could not start this class viewer. Please try again.");
    }
    const isAnonymous = Boolean(auth.user?.is_anonymous);

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
      ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", memberIds)
      : { data: [] };
    const rosterProfile = (profiles ?? []).find(
      (profile) => profile.full_name.trim().toLowerCase() === data.name.toLowerCase(),
    );
    if (!rosterProfile) {
      throw new Error("Enter your name exactly as it appears on your teacher's class roster.");
    }
    if (!isAnonymous && rosterProfile.id !== guestId) {
      throw new Error("Use the roster name belonging to your signed-in account.");
    }

    if (isAnonymous) {
      const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(guestId, {
        app_metadata: { mirror_only: true },
      });
      if (metadataError) throw new Error(metadataError.message);
      const [{ error: profileError }, { error: memberError }] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .upsert({ id: guestId, full_name: rosterProfile.full_name, email: null }),
        supabaseAdmin
          .from("class_members")
          .upsert(
            { class_id: klass.id, student_id: guestId },
            { onConflict: "class_id,student_id" },
          ),
      ]);
      if (profileError) throw new Error(profileError.message);
      if (memberError) throw new Error(memberError.message);
    }

    const { data: existingGuestProfile } = await supabaseAdmin
      .from("game_profiles")
      .select("id")
      .eq("class_id", klass.id)
      .eq("student_id", guestId)
      .maybeSingle();
    let viewerAlias: string | null = null;
    if (isAnonymous && !existingGuestProfile) {
      const { data: rosterGameProfile } = await supabaseAdmin
        .from("game_profiles")
        .select("alias")
        .eq("class_id", klass.id)
        .eq("student_id", rosterProfile.id)
        .maybeSingle();
      const { data: aliases } = await supabaseAdmin
        .from("game_profiles")
        .select("alias")
        .eq("class_id", klass.id);
      const taken = new Set((aliases ?? []).map((row) => row.alias as string));
      let alias = rosterGameProfile?.alias as string | undefined;
      // Retain the enrolled student's animal/avatar. If aliases are unique in
      // this deployment, a suffix distinguishes this browser-only viewer while
      // AliasAvatar still recognises the same animal name.
      if (alias && taken.has(alias)) alias = `${alias}Viewer`;
      if (!alias || taken.has(alias)) alias = uniqueAlias(taken);
      await supabaseAdmin
        .from("game_profiles")
        .insert({ class_id: klass.id, student_id: guestId, alias });
      viewerAlias = alias;
    } else {
      const { data: profile } = await supabaseAdmin
        .from("game_profiles")
        .select("alias")
        .eq("class_id", klass.id)
        .eq("student_id", guestId)
        .maybeSingle();
      viewerAlias = (profile?.alias as string | undefined) ?? null;
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
