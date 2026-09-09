import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";
import { LOCKED_MESSAGE } from "@/lib/integrity";
import { cleanMathText } from "@/lib/math-text";
import { isDemoEmail } from "@/lib/demo";
import { isHigherLevelTag } from "@/lib/ib-level.functions";
import { isPhotoMode, resolvePhotoMode } from "@/lib/photo-mode";
import { teachesClass, teachingClassIds } from "@/lib/teach-access";
import { cropAfter } from "@/lib/next-crop";
import {
  formatLabel,
  nextLabelAfter,
  parseLabelString,
  questionLabel,
  setQuestionLabel,
} from "@/lib/question-label";



async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function decodeBase64(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function makeJoinCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/* ------------------------------------------------------------------ me ---- */

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const role = roles?.some((r) => r.role === "teacher") ? "teacher" : "student";
    const { data: authUser } = await supabase.auth.getUser();
    const email = authUser.user?.email ?? profile?.email ?? "";
    return {
      id: userId,
      fullName: profile?.full_name ?? "",
      email,
      role: role as "teacher" | "student",
      isDemo: isDemoEmail(email),
    };
  });

export const setOAuthRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ role: z.enum(["teacher", "student"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user.user) throw new Error("Could not verify user.");

    const isOAuth = user.user.identities?.some((identity) => identity.provider !== "email") ?? false;
    if (!isOAuth) throw new Error("Role can only be set after OAuth sign-in.");

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const hasTeacher = roles?.some((r) => r.role === "teacher");
    const hasStudent = roles?.some((r) => r.role === "student");

    if (data.role === "teacher") {
      if (hasTeacher) return { ok: true };
      if (!hasStudent) throw new Error("Role can only be set once after first sign-in.");

      const adminClient = await admin();
      await adminClient.from("user_roles").delete().eq("user_id", userId).eq("role", "student");
      const { error } = await adminClient.from("user_roles").insert({ user_id: userId, role: "teacher" });
      if (error) throw new Error(error.message);
    } else {
      if (hasStudent) return { ok: true };
      const adminClient = await admin();
      const { error } = await adminClient.from("user_roles").insert({ user_id: userId, role: "student" });
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

/* --------------------------------------------------------------- teacher --- */

export const listTeacherClasses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: classes, error } = await supabase
      .from("classes")
      .select("id, name, curriculum, subject, join_code, created_at")
      .in("id", await teachingClassIds(supabase, userId))
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (classes ?? []).map((c) => c.id);
    if (ids.length === 0) return [];

    const [{ data: members }, { data: assignments }] = await Promise.all([
      supabase.from("class_members").select("class_id").in("class_id", ids),
      supabase.from("assignments").select("class_id").in("class_id", ids),
    ]);

    return (classes ?? []).map((c) => ({
      ...c,
      studentCount: (members ?? []).filter((m) => m.class_id === c.id).length,
      assignmentCount: (assignments ?? []).filter((a) => a.class_id === c.id).length,
    }));
  });

export const createClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ name: z.string().min(1), curriculum: z.string().min(1), subject: z.string() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "teacher",
    });
    if (!isTeacher) throw new Error("Only teachers can create classes.");

    let lastError = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: created, error } = await supabase
        .from("classes")
        .insert({
          teacher_id: userId,
          name: data.name,
          curriculum: data.curriculum,
          subject: data.subject,
          join_code: makeJoinCode(),
        })
        .select("id, name, join_code")
        .single();
      if (!error) return created;
      lastError = error.message;
    }
    throw new Error(lastError || "Could not create class.");
  });

export const updateClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        name: z.string().min(1),
        curriculum: z.string().min(1),
        subject: z.string(),
        joinCode: z.string().trim().min(4).max(10).optional(),
        regenerateJoinCode: z.boolean().optional(),
        aiWarningLimit: z.number().int().min(0).max(10).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: klass, error: classError } = await supabase
      .from("classes")
      .select("id, teacher_id")
      .eq("id", data.classId)
      .maybeSingle();
    if (classError) throw new Error(classError.message);
    if (!klass || !(await teachesClass(supabase, klass.id, userId))) {
      throw new Error("You do not teach this class.");
    }

    const joinCode = data.regenerateJoinCode
      ? makeJoinCode()
      : data.joinCode
        ? data.joinCode.toUpperCase()
        : undefined;
    const patch = {
      name: data.name,
      curriculum: data.curriculum,
      subject: data.subject,
      ...(joinCode ? { join_code: joinCode } : {}),
      ...(data.aiWarningLimit === undefined ? {} : { ai_warning_limit: data.aiWarningLimit }),
    };

    const { data: updated, error } = await supabase
      .from("classes")
      .update(patch)
      .eq("id", data.classId)
      .select("id, name, curriculum, subject, join_code, ai_warning_limit")
      .single();
    if (error) {
      if (error.code === "23505" || error.message.includes("duplicate")) {
        throw new Error("That join code is already taken. Try another.");
      }
      throw new Error(error.message);
    }
    return updated;
  });

export const removeStudentFromClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ classId: z.string().uuid(), studentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isTeacher) throw new Error("You do not own this class.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: assignments } = await supabaseAdmin
      .from("assignments")
      .select("id")
      .eq("class_id", data.classId);
    const assignmentIds = (assignments ?? []).map((a) => a.id);

    if (assignmentIds.length > 0) {
      const { data: subs } = await supabaseAdmin
        .from("submissions")
        .select("id")
        .eq("student_id", data.studentId)
        .in("assignment_id", assignmentIds);
      const subIds = (subs ?? []).map((s) => s.id);
      if (subIds.length > 0) {
        const { data: answers } = await supabaseAdmin
          .from("answers")
          .select("id")
          .in("submission_id", subIds);
        const answerIds = (answers ?? []).map((a) => a.id);
        if (answerIds.length > 0) {
          await supabaseAdmin.from("tutor_messages").delete().in("answer_id", answerIds);
          await supabaseAdmin.from("answers").delete().in("id", answerIds);
        }
        await supabaseAdmin.from("integrity_flags").delete().in("submission_id", subIds);
        await supabaseAdmin.from("submissions").delete().in("id", subIds);
      }
      await supabaseAdmin
        .from("student_assignment_settings")
        .delete()
        .eq("student_id", data.studentId)
        .in("assignment_id", assignmentIds);
    }

    await supabaseAdmin
      .from("class_messages")
      .delete()
      .eq("class_id", data.classId)
      .eq("student_id", data.studentId);

    const { error } = await supabaseAdmin
      .from("class_members")
      .delete()
      .eq("class_id", data.classId)
      .eq("student_id", data.studentId);
    if (error) throw new Error(error.message);

    // Purge the student from the rest of the platform too.
    const { data: quizAttempts } = await supabaseAdmin
      .from("quiz_attempts")
      .select("id")
      .eq("student_id", data.studentId);
    const attemptIds = (quizAttempts ?? []).map((a) => a.id);
    if (attemptIds.length > 0) {
      await supabaseAdmin.from("quiz_answers").delete().in("attempt_id", attemptIds);
      await supabaseAdmin.from("quiz_attempts").delete().in("id", attemptIds);
    }
    await supabaseAdmin.from("game_attempts").delete().eq("student_id", data.studentId);
    await supabaseAdmin.from("game_rounds").delete().eq("student_id", data.studentId);
    await supabaseAdmin.from("game_profiles").delete().eq("student_id", data.studentId);
    await supabaseAdmin.from("daily_doubles").delete().eq("student_id", data.studentId);
    await supabaseAdmin.from("token_ledger").delete().eq("student_id", data.studentId);
    await supabaseAdmin.from("formative_responses").delete().eq("student_id", data.studentId);
    await supabaseAdmin.from("question_exclusions").delete().eq("student_id", data.studentId);
    await supabaseAdmin.from("class_student_settings").delete().eq("student_id", data.studentId);
    await supabaseAdmin.from("activity_events").delete().eq("user_id", data.studentId);
    await supabaseAdmin.from("support_messages").delete().eq("user_id", data.studentId);
    await supabaseAdmin.from("class_messages").delete().eq("student_id", data.studentId);
    await supabaseAdmin.from("class_members").delete().eq("student_id", data.studentId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.studentId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.studentId);
    await supabaseAdmin.auth.admin.deleteUser(data.studentId).catch(() => undefined);

    return { ok: true };
  });

export const deleteClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isTeacher) throw new Error("You do not own this class.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: assignments } = await supabaseAdmin
      .from("assignments")
      .select("id")
      .eq("class_id", data.classId);
    const assignmentIds = (assignments ?? []).map((a) => a.id);

    if (assignmentIds.length > 0) {
      const { data: subs } = await supabaseAdmin
        .from("submissions")
        .select("id")
        .in("assignment_id", assignmentIds);
      const subIds = (subs ?? []).map((s) => s.id);
      if (subIds.length > 0) {
        const { data: answers } = await supabaseAdmin
          .from("answers")
          .select("id")
          .in("submission_id", subIds);
        const answerIds = (answers ?? []).map((a) => a.id);
        if (answerIds.length > 0) {
          await supabaseAdmin.from("tutor_messages").delete().in("answer_id", answerIds);
          await supabaseAdmin.from("answers").delete().in("id", answerIds);
        }
        await supabaseAdmin.from("integrity_flags").delete().in("submission_id", subIds);
        await supabaseAdmin.from("submissions").delete().in("id", subIds);
      }
      const { data: questions } = await supabaseAdmin
        .from("questions")
        .select("id")
        .in("assignment_id", assignmentIds);
      const questionIds = (questions ?? []).map((q) => q.id);
      if (questionIds.length > 0) {
        await supabaseAdmin.from("question_exclusions").delete().in("question_id", questionIds);
      }
      await supabaseAdmin
        .from("student_assignment_settings")
        .delete()
        .in("assignment_id", assignmentIds);
      await supabaseAdmin.from("vocab_explanations").delete().in("assignment_id", assignmentIds);
      await supabaseAdmin.from("assignment_vocab").delete().in("assignment_id", assignmentIds);
      await supabaseAdmin.from("questions").delete().in("assignment_id", assignmentIds);
    }

    // quizzes
    const { data: quizzes } = await supabaseAdmin
      .from("quizzes")
      .select("id")
      .eq("class_id", data.classId);
    const quizIds = (quizzes ?? []).map((q) => q.id);
    if (quizIds.length > 0) {
      const { data: attempts } = await supabaseAdmin
        .from("quiz_attempts")
        .select("id")
        .in("quiz_id", quizIds);
      const attemptIds = (attempts ?? []).map((a) => a.id);
      if (attemptIds.length > 0) {
        await supabaseAdmin.from("quiz_answers").delete().in("attempt_id", attemptIds);
        await supabaseAdmin.from("quiz_attempts").delete().in("id", attemptIds);
      }
      await supabaseAdmin.from("quiz_questions").delete().in("quiz_id", quizIds);
      await supabaseAdmin.from("quizzes").delete().in("id", quizIds);
    }

    // games
    const { data: matches } = await supabaseAdmin
      .from("game_matches")
      .select("id")
      .eq("class_id", data.classId);
    const matchIds = (matches ?? []).map((m) => m.id);
    if (matchIds.length > 0) {
      await supabaseAdmin.from("game_attempts").delete().in("match_id", matchIds);
      await supabaseAdmin.from("game_matches").delete().in("id", matchIds);
    }
    await supabaseAdmin.from("game_rounds").delete().eq("class_id", data.classId);
    await supabaseAdmin.from("daily_doubles").delete().eq("class_id", data.classId);
    await supabaseAdmin.from("token_ledger").delete().eq("class_id", data.classId);
    await supabaseAdmin.from("game_profiles").delete().eq("class_id", data.classId);
    await supabaseAdmin.from("class_game_settings").delete().eq("class_id", data.classId);

    // materials
    await supabaseAdmin.from("unit_materials").delete().eq("class_id", data.classId);
    await supabaseAdmin.from("class_units").delete().eq("class_id", data.classId);

    await supabaseAdmin.from("class_student_settings").delete().eq("class_id", data.classId);
    await supabaseAdmin.from("class_messages").delete().eq("class_id", data.classId);
    await supabaseAdmin.from("class_announcements").delete().eq("class_id", data.classId);
    await supabaseAdmin.from("assignments").delete().eq("class_id", data.classId);
    await supabaseAdmin.from("class_members").delete().eq("class_id", data.classId);


    const { error } = await supabaseAdmin.from("classes").delete().eq("id", data.classId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const createAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        title: z.string().min(1),
        subject: z.string(),
        instructions: z.string(),
        dueAt: z.string().nullable(),
        protectQuestions: z.boolean().optional(),
        questions: z.array(
          z.object({
            questionText: z.string().min(1),
            markScheme: z.string().min(1),
            marks: z.number().int().positive(),
            imagePaths: z.array(z.string()).default([]),
            answerImagePaths: z.array(z.string()).default([]),
            tagLabel: z.string().max(12).default(""),
            tagImage: z.string().max(200000).default(""),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.questions.length === 0) throw new Error("Add at least one question.");

    const { data: klass, error: classError } = await supabase
      .from("classes")
      .select("id, teacher_id")
      .eq("id", data.classId)
      .maybeSingle();
    if (classError) throw new Error(classError.message);
    if (!klass || !(await teachesClass(supabase, klass.id, userId))) {
      throw new Error("You do not teach this class.");
    }

    const { data: assignment, error } = await supabase
      .from("assignments")
      .insert({
        class_id: data.classId,
        created_by: userId,
        title: data.title,
        subject: data.subject,
        instructions: data.instructions,
        due_at: data.dueAt,
        protect_questions: data.protectQuestions ?? false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: qError } = await supabase.from("questions").insert(
      data.questions.map((q, index) => ({
        assignment_id: assignment.id,
        position: index + 1,
        question_text: cleanMathText(q.questionText),
        mark_scheme: cleanMathText(q.markScheme),
        marks: q.marks,
        image_paths: q.imagePaths ?? [],
        answer_image_paths: q.answerImagePaths ?? [],
        tag_label: q.tagLabel ?? "",
        tag_image: q.tagImage ?? "",
      })),
    );
    if (qError) throw new Error(qError.message);

    return { id: assignment.id };
  });

export const getAssignmentForEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canTeach } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this assignment.");

    const { data: assignment, error } = await supabase
      .from("assignments")
      .select("id, title, subject, instructions, due_at, protect_questions")
      .eq("id", data.assignmentId)
      .single();
    if (error) throw new Error(error.message);

    const { data: questions, error: qError } = await supabase
      .from("questions")
      .select(
        "id, question_text, mark_scheme, marks, position, image_paths, answer_image_paths, tag_label, tag_image",
      )
      .eq("assignment_id", data.assignmentId)
      .order("position");
    if (qError) throw new Error(qError.message);

    return {
      id: assignment.id,
      title: assignment.title,
      subject: assignment.subject ?? "",
      instructions: assignment.instructions ?? "",
      dueAt: assignment.due_at,
      protectQuestions: Boolean(assignment.protect_questions),
      questions: await Promise.all(
        (questions ?? []).map(async (q) => ({
          id: q.id,
          questionText: q.question_text,
          markScheme: q.mark_scheme,
          marks: q.marks,
          imagePaths: q.image_paths ?? [],
          imageUrls: await signPaperPages(await admin(), q.image_paths ?? []),
          answerImagePaths: q.answer_image_paths ?? [],
          answerImageUrls: await signPaperPages(await admin(), q.answer_image_paths ?? []),
          tagLabel: q.tag_label ?? "",
          tagImage: q.tag_image ?? "",
        })),
      ),
    };
  });

/** Toggle question copy-protection for one assignment without resending the whole form. */
export const setQuestionProtection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        protectQuestions: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canTeach } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this assignment.");
    const { error } = await supabase
      .from("assignments")
      .update({ protect_questions: data.protectQuestions })
      .eq("id", data.assignmentId);
    if (error) throw new Error(error.message);
    return { ok: true, protectQuestions: data.protectQuestions };
  });

/** Save a teacher's manual crop without changing any other assignment content. */
export const updateQuestionCrop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        questionId: z.string().uuid(),
        imagePaths: z.array(z.string().min(1)).min(1).max(3),
        target: z.enum(["question", "answer"]).default("question"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = await admin();
    const question = await questionForTeacher(supabase, db, data.questionId, userId);
    const { data: current } = await db
      .from("questions")
      .select("image_paths, answer_image_paths")
      .eq("id", question.id)
      .single();
    const existingPaths = (data.target === "answer"
      ? current?.answer_image_paths
      : current?.image_paths) as string[] | null | undefined;
    const allowedPages = new Set((existingPaths ?? []).map((path) => path.split("#")[0]));
    // The teacher may move a cut onto another page of the same uploaded document
    // (a question often runs over a page break), so allow any page in that folder.
    const allowedFolders = new Set(
      [...allowedPages]
        .map((page) => (page ?? "").slice(0, (page ?? "").lastIndexOf("/")))
        .filter(Boolean),
    );
    const cropPattern = /#crop=(0(?:\.\d+)?|1(?:\.0+)?),(0(?:\.\d+)?|1(?:\.0+)?);manual$/;
    for (const path of data.imagePaths) {
      const page = path.split("#")[0];
      const match = cropPattern.exec(path);
      const folder = page ? page.slice(0, page.lastIndexOf("/")) : "";
      const sameDocument = Boolean(folder) && allowedFolders.has(folder);
      if (!page || !(allowedPages.has(page) || sameDocument) || !match) {
        throw new Error("That crop is not valid.");
      }
      const top = Number(match[1]);
      const bottom = Number(match[2]);
      if (bottom - top < 0.035) throw new Error("The crop is too small.");
    }
    const { error } = await db
      .from("questions")
      .update(
        data.target === "answer"
          ? { answer_image_paths: data.imagePaths }
          : { image_paths: data.imagePaths },
      )
      .eq("id", question.id);
    if (error) throw new Error(error.message);
    return { ok: true, imagePaths: data.imagePaths };
  });

/**
 * Teacher-only: every page of the uploaded document a cut came from, so the
 * recut window can step forward/backward through pages and add a second page
 * when a question runs over a page break.
 */
export const listRecutPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ imagePath: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const page = data.imagePath.split("#")[0] ?? "";
    const folder = page.slice(0, page.lastIndexOf("/"));
    const classId = folder.split("/")[0] ?? "";
    if (!folder || !classId) throw new Error("That page could not be found.");
    if (!(await teachesClass(supabase, classId, userId))) {
      throw new Error("You do not teach this class.");
    }

    const db = await admin();
    const { data: files, error } = await db.storage.from("paper-pages").list(folder, {
      limit: 500,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(error.message);

    const isAnswerSheet = (page.split("/").pop() ?? "").startsWith("ms-page-");
    const pages = (files ?? [])
      .map((file) => {
        const name = file.name;
        const answerSheet = name.startsWith("ms-page-");
        const number = Number(/page-(\d+)/.exec(name)?.[1] ?? 0);
        return { path: `${folder}/${name}`, answerSheet, number };
      })
      .filter((item) => item.number > 0 && item.answerSheet === isAnswerSheet)
      .sort((a, b) => a.number - b.number);

    const urls = await signPaperPages(db, pages.map((item) => item.path));
    return {
      pages: pages.map((item, index) => ({
        path: item.path,
        url: urls[index] ?? "",
        number: item.number,
      })),
    };
  });


/**
 * Inserts a blank question straight after an existing one — for a question the
 * AI extraction missed. The number is suggested and the ones after it move
 * down, and the picture starts where the previous question's cut ended.
 */
export const insertQuestionAfter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ questionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = await admin();
    const question = await questionForTeacher(supabase, db, data.questionId, userId);
    const { data: current } = await db
      .from("questions")
      .select("id, assignment_id, position, question_text, image_paths, answer_image_paths")
      .eq("id", question.id)
      .single();
    if (!current) throw new Error("Question not found.");

    const { data: later } = await db
      .from("questions")
      .select("id, position, question_text")
      .eq("assignment_id", current.assignment_id)
      .gt("position", current.position)
      .order("position", { ascending: false });

    const label = nextLabelAfter(questionLabel(current.question_text ?? "", current.position - 1));
    const parsed = parseLabelString(label);

    for (const row of later ?? []) {
      const patch: { position: number; question_text?: string } = { position: row.position + 1 };
      if (parsed.parts.length === 0 && parsed.main !== null) {
        const rowLabel = parseLabelString(questionLabel(row.question_text ?? "", row.position - 1));
        if (rowLabel.main !== null && rowLabel.main >= parsed.main) {
          patch.question_text = setQuestionLabel(
            row.question_text ?? "",
            formatLabel(rowLabel.main + 1, rowLabel.parts),
          );
        }
      }
      const { error } = await db.from("questions").update(patch).eq("id", row.id);
      if (error) throw new Error(error.message);
    }

    const paths = (current.image_paths ?? []) as string[];
    const lastPath = paths[paths.length - 1];
    // Seed the answer picture from the previous part's answer cut, so the
    // teacher recuts the printed mark scheme instead of typing it out.
    let answerPaths = (current.answer_image_paths ?? []) as string[];
    if (answerPaths.length === 0) {
      const { data: earlier } = await db
        .from("questions")
        .select("answer_image_paths, position")
        .eq("assignment_id", current.assignment_id)
        .lte("position", current.position)
        .order("position", { ascending: false })
        .limit(20);
      for (const row of earlier ?? []) {
        const rowPaths = (row.answer_image_paths ?? []) as string[];
        if (rowPaths.length > 0) {
          answerPaths = rowPaths;
          break;
        }
      }
    }
    const lastAnswerPath = answerPaths[answerPaths.length - 1];
    const { data: inserted, error } = await db
      .from("questions")
      .insert({
        assignment_id: current.assignment_id,
        question_text: label,
        mark_scheme: "To be added.",
        marks: 1,
        position: current.position + 1,
        image_paths: lastPath ? [cropAfter(lastPath)] : [],
        answer_image_paths: lastAnswerPath ? [cropAfter(lastAnswerPath)] : [],
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, label };
  });

export const updateAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        title: z.string().min(1),
        subject: z.string(),
        instructions: z.string(),
        dueAt: z.string().nullable(),
        protectQuestions: z.boolean().optional(),
        questions: z.array(
          z.object({
            id: z.string().uuid().nullable(),
            questionText: z.string().min(1),
            markScheme: z.string().min(1),
            marks: z.number().int().positive(),
            imagePaths: z.array(z.string()).default([]),
            answerImagePaths: z.array(z.string()).default([]),
            tagLabel: z.string().max(12).default(""),
            tagImage: z.string().max(200000).default(""),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.questions.length === 0) throw new Error("Add at least one question.");

    const { data: canTeach } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this assignment.");

    const { error: aError } = await supabase
      .from("assignments")
      .update({
        title: data.title,
        subject: data.subject,
        instructions: data.instructions,
        due_at: data.dueAt,
        ...(data.protectQuestions === undefined
          ? {}
          : { protect_questions: data.protectQuestions }),
      })
      .eq("id", data.assignmentId);
    if (aError) throw new Error(aError.message);

    const { data: existing } = await supabase
      .from("questions")
      .select("id")
      .eq("assignment_id", data.assignmentId);
    const existingIds = new Set((existing ?? []).map((q) => q.id));

    const keptIds: string[] = [];
    for (const [index, q] of data.questions.entries()) {
      const payload = {
        question_text: cleanMathText(q.questionText),
        mark_scheme: cleanMathText(q.markScheme),
        marks: q.marks,
        position: index + 1,
        image_paths: q.imagePaths ?? [],
        answer_image_paths: q.answerImagePaths ?? [],
        tag_label: q.tagLabel ?? "",
        tag_image: q.tagImage ?? "",
      };
      if (q.id && existingIds.has(q.id)) {
        const { error } = await supabase.from("questions").update(payload).eq("id", q.id);
        if (error) throw new Error(error.message);
        keptIds.push(q.id);
      } else {
        const { data: inserted, error } = await supabase
          .from("questions")
          .insert({ assignment_id: data.assignmentId, ...payload })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        keptIds.push(inserted.id);
      }
    }

    const removed = [...existingIds].filter((id) => !keptIds.includes(id));
    if (removed.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: delAnswers } = await supabaseAdmin
        .from("answers")
        .delete()
        .in("question_id", removed);
      if (delAnswers) throw new Error(delAnswers.message);
      const { error: delError } = await supabase.from("questions").delete().in("id", removed);
      if (delError) throw new Error(delError.message);
    }

    const totalMarks = data.questions.reduce((sum, q) => sum + q.marks, 0);
    await supabase
      .from("submissions")
      .update({ total_marks: totalMarks })
      .eq("assignment_id", data.assignmentId);

    return { id: data.assignmentId };
  });

/**
 * Archive or restore a homework. Archived homework disappears for students
 * (and from the teacher's active list) but keeps every submission, so the
 * teacher can restore it or delete it for good from the archive.
 */
export const setAssignmentArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assignmentId: z.string().uuid(), archived: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canTeach } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this assignment.");

    const { error } = await supabase
      .from("assignments")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.assignmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canTeach } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this assignment.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("submissions")
      .select("id")
      .eq("assignment_id", data.assignmentId);
    const subIds = (subs ?? []).map((s) => s.id);
    if (subIds.length > 0) {
      const { data: answers } = await supabaseAdmin
        .from("answers")
        .select("id")
        .in("submission_id", subIds);
      const answerIds = (answers ?? []).map((a) => a.id);
      if (answerIds.length > 0) {
        await supabaseAdmin.from("tutor_messages").delete().in("answer_id", answerIds);
        await supabaseAdmin.from("answers").delete().in("id", answerIds);
      }
      await supabaseAdmin.from("submissions").delete().in("id", subIds);
    }
    await supabaseAdmin.from("questions").delete().eq("assignment_id", data.assignmentId);
    const { error } = await supabaseAdmin
      .from("assignments")
      .delete()
      .eq("id", data.assignmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });



export const getClassOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: klass, error } = await supabase
      .from("classes")
      .select(
        "id, name, curriculum, subject, join_code, teacher_id, ai_warning_limit, gradebook_detail",
      )
      .eq("id", data.classId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!klass || !(await teachesClass(supabase, klass.id, userId))) {
      throw new Error("Class not found.");
    }

    const db = await admin();

    const [{ data: members }, { data: assignments }] = await Promise.all([
      db.from("class_members").select("student_id, joined_at").eq("class_id", data.classId),
      db
        .from("assignments")
        .select("id, title, subject, due_at, created_at, protect_questions, archived_at")
        .eq("class_id", data.classId)
        .order("created_at", { ascending: false }),
    ]);

    const studentIds = (members ?? []).map((m) => m.student_id);
    const assignmentIds = (assignments ?? []).map((a) => a.id);

    const { data: profiles } = studentIds.length
      ? await db.from("profiles").select("id, full_name, email").in("id", studentIds)
      : { data: [] };

    const { data: detailOverrides } = studentIds.length
      ? await db
          .from("class_student_settings")
          .select("student_id, gradebook_detail")
          .eq("class_id", data.classId)
      : { data: [] as Array<{ student_id: string; gradebook_detail: boolean | null }> };

    const { data: questions } = assignmentIds.length
      ? await db.from("questions").select("assignment_id, marks").in("assignment_id", assignmentIds)
      : { data: [] };

    const { data: submissions } = assignmentIds.length
      ? await db
          .from("submissions")
          .select(
            "id, assignment_id, student_id, status, awarded_marks, submitted_at, locked_at, ai_flag_count, penalty_percent",
          )
          .in("assignment_id", assignmentIds)
      : { data: [] };

    const submissionIds = (submissions ?? []).map((s) => s.id);
    const { data: answers } = submissionIds.length
      ? await db
          .from("answers")
          .select("submission_id, answer_text, image_paths")
          .in("submission_id", submissionIds)
      : { data: [] as { submission_id: string; answer_text: string; image_paths: string[] }[] };

    const answeredFor = (submissionId: string | undefined) =>
      submissionId
        ? (answers ?? []).filter(
            (an) =>
              an.submission_id === submissionId &&
              ((an.answer_text ?? "").trim().length > 0 || (an.image_paths ?? []).length > 0),
          ).length
        : 0;

    const assignmentRows = (assignments ?? []).map((a) => {
      const questionCount = (questions ?? []).filter((q) => q.assignment_id === a.id).length;
      const pastDue = Boolean(a.due_at && new Date(a.due_at).getTime() < Date.now());
      const behindCount = pastDue
        ? studentIds.filter((sid) => {
            const sub = (submissions ?? []).find(
              (s) => s.assignment_id === a.id && s.student_id === sid,
            );
            const answered = answeredFor(sub?.id);
            return questionCount === 0 ? true : answered / questionCount < 0.5;
          }).length
        : 0;
      return {
        id: a.id,
        title: a.title,
        subject: a.subject,
        dueAt: a.due_at,
        totalMarks: (questions ?? [])
          .filter((q) => q.assignment_id === a.id)
          .reduce((sum, q) => sum + q.marks, 0),
        questionCount,
        submittedCount: (submissions ?? []).filter(
          (s) => s.assignment_id === a.id && s.status === "submitted",
        ).length,
        pastDue,
        behindCount,
        protectQuestions: Boolean(
          (a as { protect_questions?: boolean | null }).protect_questions,
        ),
        archivedAt: ((a as { archived_at?: string | null }).archived_at ?? null) as string | null,
        /** Live scores: grades update as students work; the deadline only freezes them. */
        resultsReleased: true,
      };
    });


    const classDetail = (klass as { gradebook_detail?: boolean | null }).gradebook_detail !== false;

    const students = studentIds.map((id) => {
      const profile = (profiles ?? []).find((p) => p.id === id);
      const override = (detailOverrides ?? []).find((o) => o.student_id === id);
      const grades = assignmentRows.map((a) => {
        const sub = (submissions ?? []).find(
          (s) => s.assignment_id === a.id && s.student_id === id,
        );
        return {
          assignmentId: a.id,
          status: sub?.status ?? "not_started",
          awardedMarks: sub ? Number(sub.awarded_marks) : null,
          totalMarks: a.totalMarks,
          locked: Boolean(sub?.locked_at),
          aiFlagCount: sub?.ai_flag_count ?? 0,
          penaltyPercent: Number(sub?.penalty_percent ?? 0),
          resultsReleased: a.resultsReleased,
        };
      });
      const marked = grades.filter(
        (g) => g.awardedMarks !== null && g.status !== "not_started",
      );

      const earned = marked.reduce((sum, g) => sum + (g.awardedMarks ?? 0), 0);
      const possible = marked.reduce((sum, g) => sum + g.totalMarks, 0);
      return {
        id,
        name: profile?.full_name || profile?.email || "Student",
        email: profile?.email ?? "",
        grades,
        average: possible > 0 ? Math.round((earned / possible) * 100) : null,
        detailOverride: (override?.gradebook_detail ?? null) as boolean | null,
        detailEnabled: override?.gradebook_detail ?? classDetail,
      };
    });

    return { klass, assignments: assignmentRows, students };
  });

export const overrideAnswerMarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ answerId: z.string().uuid(), marks: z.number(), feedback: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: { awarded_marks: number; feedback?: string } = { awarded_marks: data.marks };
    if (data.feedback !== undefined) patch.feedback = data.feedback;
    const { data: updated, error } = await supabase
      .from("answers")
      .update(patch)
      .eq("id", data.answerId)
      .select("id, submission_id")
      .single();
    if (error) throw new Error(error.message);
    await recalcSubmission(await admin(), updated.submission_id);
    return { ok: true };
  });

/**
 * Teacher-only: sends one answer back to the student to redo. Marks and
 * feedback for that question are cleared, the question re-opens in the
 * student's workspace, and the student gets a class message about it.
 */
export const rejectAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ answerId: z.string().uuid(), note: z.string().max(600).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: teaches } = await supabase.rpc("teaches_answer", {
      _answer_id: data.answerId,
      _user_id: userId,
    });
    if (!teaches) throw new Error("Not allowed.");

    const db = await admin();
    const { data: answer, error } = await db
      .from("answers")
      .select("id, submission_id, question_id")
      .eq("id", data.answerId)
      .single();
    if (error) throw new Error(error.message);

    const note = (data.note ?? "").trim();
    await db
      .from("answers")
      .update({
        verdict: null,
        awarded_marks: 0,
        feedback: note ? `Sent back by your teacher: ${note}` : "Sent back by your teacher to redo.",
        resolved: false,
        mark_breakdown: [],
        rejected_at: new Date().toISOString(),
        rejected_by: userId,
        rejection_note: note || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.answerId);

    const { data: submission } = await db
      .from("submissions")
      .select("id, assignment_id, student_id")
      .eq("id", answer.submission_id)
      .single();

    if (submission) {
      await db
        .from("submissions")
        .update({ status: "in_progress", submitted_at: null })
        .eq("id", submission.id);

      const { data: assignmentRow } = await db
        .from("assignments")
        .select("class_id, title")
        .eq("id", submission.assignment_id)
        .maybeSingle();
      const { data: questionRow } = await db
        .from("questions")
        .select("position")
        .eq("id", answer.question_id)
        .maybeSingle();

      if (assignmentRow) {
        await db.from("class_messages").insert({
          class_id: assignmentRow.class_id,
          student_id: submission.student_id,
          sender_id: userId,
          sender_role: "teacher",
          assignment_id: submission.assignment_id,
          question_id: answer.question_id,
          topic: `Redo question ${questionRow?.position ?? ""} — ${assignmentRow.title}`.trim(),
          body: note
            ? `Your teacher sent this question back for you to redo. ${note}`
            : "Your teacher sent this question back for you to redo. Open the homework and answer it again in your own work.",
        });
      }
    }

    await recalcSubmission(db, answer.submission_id);
    return { ok: true };
  });

/**
 * Student-facing: every question a teacher has sent back to be redone, newest
 * first. Used for the pop-up shown when a student opens the app.
 */
export const listRedoAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("answers")
      .select(
        "id, rejected_at, rejection_note, questions(position), submissions!inner(student_id, assignment_id, assignments(title))",
      )
      .eq("submissions.student_id", userId)
      .not("rejected_at", "is", null)
      .order("rejected_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const submission = row.submissions as unknown as {
        assignment_id: string;
        assignments: { title: string } | null;
      };
      const question = row.questions as unknown as { position: number } | null;
      return {
        answerId: row.id as string,
        rejectedAt: row.rejected_at as string,
        note: (row.rejection_note as string | null) ?? null,
        assignmentId: submission?.assignment_id ?? "",
        assignmentTitle: submission?.assignments?.title ?? "Homework",
        questionPosition: question?.position ?? null,
      };
    });
  });


/**
 * Teacher override for one question across the class: give full credit, mark it
 * incorrect (0 marks) or send it back to be redone — for every student or a
 * chosen few. Overrides whatever the AI decided.
 */
export const bulkGradeQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        questionId: z.string().uuid(),
        action: z.enum(["credit", "incorrect", "reject"]),
        studentIds: z.array(z.string().uuid()).max(300).optional(),
        note: z.string().max(600).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canTeach } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!canTeach) throw new Error("You do not teach this assignment.");

    const db = await admin();
    const [{ data: assignmentRow }, { data: question }, { data: questions }] = await Promise.all([
      db.from("assignments").select("id, class_id, title").eq("id", data.assignmentId).single(),
      db
        .from("questions")
        .select("id, assignment_id, position, marks")
        .eq("id", data.questionId)
        .single(),
      db.from("questions").select("marks").eq("assignment_id", data.assignmentId),
    ]);
    if (!assignmentRow || !question || question.assignment_id !== data.assignmentId) {
      throw new Error("Question not found on this homework.");
    }
    const assignmentTotal = (questions ?? []).reduce((sum, q) => sum + q.marks, 0);

    const { data: members } = await db
      .from("class_members")
      .select("student_id")
      .eq("class_id", assignmentRow.class_id);
    const classStudents = new Set((members ?? []).map((m) => m.student_id as string));
    const targets = (
      data.studentIds && data.studentIds.length > 0 ? data.studentIds : [...classStudents]
    ).filter((id) => classStudents.has(id));
    if (targets.length === 0) throw new Error("No students selected.");

    const note = (data.note ?? "").trim();
    const now = new Date().toISOString();
    let changed = 0;

    for (const studentId of targets) {
      // Make sure a submission and answer row exist so the override always lands.
      let { data: submission } = await db
        .from("submissions")
        .select("id")
        .eq("assignment_id", data.assignmentId)
        .eq("student_id", studentId)
        .maybeSingle();
      if (!submission) {
        if (data.action === "reject") continue; // nothing to send back yet
        const { data: created } = await db
          .from("submissions")
          .insert({
            assignment_id: data.assignmentId,
            student_id: studentId,
            status: "in_progress",
            total_marks: assignmentTotal,
          })
          .select("id")
          .single();
        submission = created;
      }
      if (!submission) continue;

      const { data: answer } = await db
        .from("answers")
        .select("id")
        .eq("submission_id", submission.id)
        .eq("question_id", data.questionId)
        .maybeSingle();

      let answerId = answer?.id as string | undefined;
      if (!answerId) {
        if (data.action === "reject") continue;
        const { data: createdAnswer } = await db
          .from("answers")
          .insert({
            submission_id: submission.id,
            question_id: data.questionId,
            answer_text: "",
          })
          .select("id")
          .single();
        answerId = createdAnswer?.id as string | undefined;
      }
      if (!answerId) continue;

      if (data.action === "credit") {
        await db
          .from("answers")
          .update({
            verdict: "correct",
            awarded_marks: question.marks,
            feedback: note || "Full marks awarded by your teacher.",
            resolved: true,
            rejected_at: null,
            rejected_by: null,
            rejection_note: null,
            updated_at: now,
          })
          .eq("id", answerId);
      } else if (data.action === "incorrect") {
        await db
          .from("answers")
          .update({
            verdict: "incorrect",
            awarded_marks: 0,
            feedback: note || "Marked incorrect by your teacher.",
            resolved: false,
            rejected_at: null,
            rejected_by: null,
            rejection_note: null,
            updated_at: now,
          })
          .eq("id", answerId);
      } else {
        await db
          .from("answers")
          .update({
            verdict: null,
            awarded_marks: 0,
            feedback: note
              ? `Sent back by your teacher: ${note}`
              : "Sent back by your teacher to redo.",
            resolved: false,
            mark_breakdown: [],
            rejected_at: now,
            rejected_by: userId,
            rejection_note: note || null,
            updated_at: now,
          })
          .eq("id", answerId);
        await db
          .from("submissions")
          .update({ status: "in_progress", submitted_at: null })
          .eq("id", submission.id);
        await db.from("class_messages").insert({
          class_id: assignmentRow.class_id,
          student_id: studentId,
          sender_id: userId,
          sender_role: "teacher",
          assignment_id: data.assignmentId,
          question_id: data.questionId,
          topic: `Redo question ${question.position} — ${assignmentRow.title}`.trim(),
          body: note
            ? `Your teacher sent this question back for you to redo. ${note}`
            : "Your teacher sent this question back for you to redo. Open the homework and answer it again in your own work.",
        });
      }

      await recalcSubmission(db, submission.id);
      changed += 1;
    }

    return { ok: true, changed };
  });




export const getSubmissionDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ assignmentId: z.string().uuid(), studentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("Not allowed.");

    const db = await admin();
    const { data: questions } = await db
      .from("questions")
      .select("id, position, question_text, mark_scheme, marks, image_paths")
      .eq("assignment_id", data.assignmentId)
      .order("position");

    const { data: submission } = await db
      .from("submissions")
      .select(
        "id, status, awarded_marks, total_marks, submitted_at, ai_flag_count, locked_at, locked_reason",
      )
      .eq("assignment_id", data.assignmentId)
      .eq("student_id", data.studentId)
      .maybeSingle();

    const { data: integrityFlags } = submission
      ? await db
          .from("integrity_flags")
          .select("id, question_id, reason, excerpt, confidence, created_at")
          .eq("submission_id", submission.id)
          .order("created_at")
      : { data: [] };


    const { data: answers } = submission
      ? await db
          .from("answers")
          .select(
            "id, question_id, answer_text, image_paths, verdict, awarded_marks, feedback, attempts, time_spent_seconds, mark_breakdown, rejected_at, rejection_note",
          )
          .eq("submission_id", submission.id)
      : { data: [] };

    const withImages = await Promise.all(
      (answers ?? []).map(async (a) => ({
        ...a,
        imageUrls: await signWorkImages(db, a.image_paths ?? []),
      })),
    );

    const questionsWithPages = await Promise.all(
      (questions ?? []).map(async (q) => ({
        ...q,
        imageUrls: await signPaperPages(db, q.image_paths ?? []),
      })),
    );

    const answerIds = withImages.map((a) => a.id);
    const { data: tutorMessages } = answerIds.length
      ? await db
          .from("tutor_messages")
          .select("id, answer_id, role, content, created_at")
          .in("answer_id", answerIds)
          .order("created_at")
      : { data: [] };

    return {
      questions: questionsWithPages,
      submission,
      answers: withImages,
      messages: tutorMessages ?? [],
      integrityFlags: integrityFlags ?? [],
    };
  });

/** Teacher-only: clears AI strikes and unlocks a locked homework submission. */
export const unlockSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        studentId: z.string().uuid(),
        penaltyPercent: z.number().min(0).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("Not allowed.");

    const db = await admin();
    const { data: submission } = await db
      .from("submissions")
      .select("id, penalty_percent")
      .eq("assignment_id", data.assignmentId)
      .eq("student_id", data.studentId)
      .maybeSingle();
    if (!submission) throw new Error("No submission to unlock.");

    // Deductions stack: every unlock adds to what was already taken off.
    const previous = Number(submission.penalty_percent ?? 0);
    const total = Math.min(100, previous + (data.penaltyPercent ?? 0));

    const { error } = await db
      .from("submissions")
      .update({
        ai_flag_count: 0,
        locked_at: null,
        locked_reason: null,
        penalty_percent: total,
      })
      .eq("id", submission.id);
    if (error) throw new Error(error.message);


    await recalcSubmission(db, submission.id);
    return { ok: true };
  });

/**
 * Teacher-only: everything one student did across a class — time per question,
 * every wrong attempt with its photos, and every tutor prompt they typed.
 */
export const getStudentClassReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ classId: z.string().uuid(), studentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isTeacher) throw new Error("Not allowed.");

    const db = await admin();
    const { data: assignments } = await db
      .from("assignments")
      .select("id, title, created_at")
      .eq("class_id", data.classId)
      .order("created_at", { ascending: false });

    const assignmentIds = (assignments ?? []).map((a) => a.id);
    if (assignmentIds.length === 0) return { assignments: [] };

    const [{ data: questions }, { data: submissions }] = await Promise.all([
      db
        .from("questions")
        .select("id, assignment_id, position, question_text, marks")
        .in("assignment_id", assignmentIds)
        .order("position"),
      db
        .from("submissions")
        .select(
          "id, assignment_id, status, awarded_marks, total_marks, submitted_at, locked_at, locked_reason, ai_flag_count, penalty_percent",
        )
        .in("assignment_id", assignmentIds)
        .eq("student_id", data.studentId),
    ]);

    const submissionIds = (submissions ?? []).map((s) => s.id);
    const { data: answers } = submissionIds.length
      ? await db
          .from("answers")
          .select(
            "id, submission_id, question_id, answer_text, image_paths, verdict, awarded_marks, feedback, attempts, time_spent_seconds, attempt_history",
          )
          .in("submission_id", submissionIds)
      : { data: [] };

    const answerIds = (answers ?? []).map((a) => a.id);
    const { data: tutorMessages } = answerIds.length
      ? await db
          .from("tutor_messages")
          .select("id, answer_id, role, content, created_at")
          .in("answer_id", answerIds)
          .order("created_at")
      : { data: [] };

    const questionIds = (questions ?? []).map((q) => q.id);
    const { data: helpMessages } = questionIds.length
      ? await (db as any)
          .from("question_help_messages")
          .select("id, question_id, mode, role, content, created_at")
          .in("question_id", questionIds)
          .eq("student_id", data.studentId)
          .order("created_at")
      : { data: [] };


    const report = await Promise.all(
      (assignments ?? []).map(async (assignment) => {
        const submission = (submissions ?? []).find((s) => s.assignment_id === assignment.id);
        const assignmentQuestions = (questions ?? []).filter(
          (q) => q.assignment_id === assignment.id,
        );
        const totalMarks =
          Number(submission?.total_marks ?? 0) ||
          assignmentQuestions.reduce((sum, q) => sum + q.marks, 0);

        const questionRows = await Promise.all(
          assignmentQuestions.map(async (question) => {
            const answer = (answers ?? []).find(
              (a) => a.submission_id === submission?.id && a.question_id === question.id,
            );
            const rawHistory = Array.isArray(answer?.attempt_history)
              ? (answer!.attempt_history as Array<Record<string, unknown>>)
              : [];
            const history = await Promise.all(
              rawHistory.map(async (entry) => ({
                at: String(entry["at"] ?? ""),
                answerText: String(entry["answer_text"] ?? ""),
                verdict: String(entry["verdict"] ?? ""),
                awardedMarks: Number(entry["awarded_marks"] ?? 0),
                feedback: String(entry["feedback"] ?? ""),
                imageUrls: await signWorkImages(
                  db,
                  Array.isArray(entry["image_paths"]) ? (entry["image_paths"] as string[]) : [],
                ),
              })),
            );
            return {
              id: question.id,
              position: question.position,
              questionText: question.question_text,
              marks: question.marks,
              verdict: answer?.verdict ?? null,
              awardedMarks: answer ? Number(answer.awarded_marks) : null,
              feedback: answer?.feedback ?? "",
              attempts: answer?.attempts ?? 0,
              timeSpentSeconds: answer?.time_spent_seconds ?? 0,
              imageUrls: await signWorkImages(db, answer?.image_paths ?? []),
              history,
              tutorPrompts: (tutorMessages ?? [])
                .filter((m) => m.answer_id === answer?.id)
                .map((m) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  createdAt: m.created_at,
                })),
              helpMessages: ((helpMessages ?? []) as Array<{
                id: string;
                question_id: string;
                mode: string;
                role: string;
                content: string;
                created_at: string;
              }>)
                .filter((m) => m.question_id === question.id)
                .map((m) => ({
                  id: m.id,
                  mode: m.mode as "hint" | "steps",
                  role: m.role,
                  content: m.content,
                  createdAt: m.created_at,
                })),
            };

          }),
        );

        return {
          assignmentId: assignment.id,
          title: assignment.title,
          status: submission?.status ?? "not_started",
          awardedMarks: submission ? Number(submission.awarded_marks) : null,
          totalMarks,
          locked: Boolean(submission?.locked_at),
          lockedReason: submission?.locked_reason ?? null,
          aiFlagCount: submission?.ai_flag_count ?? 0,
          penaltyPercent: Number(submission?.penalty_percent ?? 0),
          timeSpentSeconds: questionRows.reduce((sum, q) => sum + q.timeSpentSeconds, 0),
          attempts: questionRows.reduce((sum, q) => sum + q.attempts, 0),
          questions: questionRows,
        };
      }),
    );

    return { assignments: report };
  });


/* --------------------------------------------------------------- student --- */

export const joinClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().min(4) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const db = await admin();
    const { data: klass } = await db
      .from("classes")
      .select("id, name")
      .eq("join_code", data.code.trim().toUpperCase())
      .maybeSingle();
    if (!klass) throw new Error("No class matches that code.");

    const { error } = await db
      .from("class_members")
      .upsert({ class_id: klass.id, student_id: userId }, { onConflict: "class_id,student_id" });
    if (error) throw new Error(error.message);
    return { classId: klass.id, name: klass.name };
  });

export const listStudentWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships } = await supabase
      .from("class_members")
      .select("class_id")
      .eq("student_id", userId);
    const classIds = (memberships ?? []).map((m) => m.class_id);
    if (classIds.length === 0) return { classes: [], assignments: [] };

    const db = await admin();
    const [{ data: classes }, { data: assignments }] = await Promise.all([
      db.from("classes").select("id, name, curriculum, subject").in("id", classIds),
      db
        .from("assignments")
        .select("id, class_id, title, subject, due_at, created_at")
        .in("class_id", classIds)
        .eq("published", true)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
    ]);

    const assignmentIds = (assignments ?? []).map((a) => a.id);
    const { data: questions } = assignmentIds.length
      ? await db.from("questions").select("assignment_id, marks").in("assignment_id", assignmentIds)
      : { data: [] };
    const { data: submissions } = assignmentIds.length
      ? await db
          .from("submissions")
          .select("id, assignment_id, status, awarded_marks")
          .eq("student_id", userId)
          .in("assignment_id", assignmentIds)
      : { data: [] };
    const { data: overrides } = assignmentIds.length
      ? await db
          .from("student_assignment_settings")
          .select("assignment_id, due_at")
          .eq("student_id", userId)
          .in("assignment_id", assignmentIds)
      : { data: [] };
    const submissionIds = (submissions ?? []).map((s) => s.id);
    const { data: answers } = submissionIds.length
      ? await db
          .from("answers")
          .select("submission_id, answer_text, image_paths")
          .in("submission_id", submissionIds)
      : { data: [] as { submission_id: string; answer_text: string; image_paths: string[] }[] };

    return {
      classes: classes ?? [],
      assignments: (assignments ?? []).map((a) => {
        const sub = (submissions ?? []).find((s) => s.assignment_id === a.id);
        const override = (overrides ?? []).find((o) => o.assignment_id === a.id);
        const answeredCount = sub
          ? (answers ?? []).filter(
              (an) =>
                an.submission_id === sub.id &&
                ((an.answer_text ?? "").trim().length > 0 || (an.image_paths ?? []).length > 0),
            ).length
          : 0;
        return {
          id: a.id,
          title: a.title,
          subject: a.subject,
          dueAt: (override?.due_at as string | null) ?? a.due_at,
          classId: a.class_id,
          className: (classes ?? []).find((c) => c.id === a.class_id)?.name ?? "",
          questionCount: (questions ?? []).filter((q) => q.assignment_id === a.id).length,
          totalMarks: (questions ?? [])
            .filter((q) => q.assignment_id === a.id)
            .reduce((sum, q) => sum + q.marks, 0),
          status: sub?.status ?? "not_started",
          awardedMarks: sub ? Number(sub.awarded_marks) : null,
          answeredCount,
        };
      }),
    };
  });

export const getAssignmentWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_study_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("This assignment is not available to you.");

    const db = await admin();
    const { data: assignmentRow } = await db
      .from("assignments")
      .select("id, title, subject, curriculum, instructions, due_at, class_id, archived_at")
      .eq("id", data.assignmentId)
      .single();
    const assignment = assignmentRow!;
    if ((assignment as { archived_at?: string | null }).archived_at) {
      const { data: canTeach } = await supabase.rpc("can_teach_assignment", {
        _assignment_id: data.assignmentId,
        _user_id: userId,
      });
      if (!canTeach) throw new Error("This assignment has been archived by your teacher.");
    }
    const { data: klass } = await db
      .from("classes")
      .select("name")
      .eq("id", assignment.class_id)
      .maybeSingle();

    const access = await studentAccess(db, data.assignmentId, userId);

    // Mark schemes are only sent once the teacher reveals them.
    const { data: allQuestions } = await db
      .from("questions")
      .select(
        "id, position, question_text, marks, image_paths, answer_image_paths, mark_scheme, photo_mode, tag_label, tag_image",
      )
      .eq("assignment_id", data.assignmentId)
      .order("position");



    const { data: exemptions } = await db
      .from("question_exclusions")
      .select("question_id")
      .eq("student_id", userId);
    const exemptIds = new Set((exemptions ?? []).map((e) => e.question_id));
    // Standard Level students never see questions the teacher marked HL.
    const { data: levelRow } = await db
      .from("class_student_settings")
      .select("ib_level")
      .eq("class_id", assignment.class_id)
      .eq("student_id", userId)
      .maybeSingle();
    const isStandardLevel = (levelRow as { ib_level?: string | null } | null)?.ib_level === "SL";
    const questions = (allQuestions ?? []).filter(
      (q) =>
        !exemptIds.has(q.id) && !(isStandardLevel && isHigherLevelTag(q.tag_label as string | null)),
    );

    const submission = await ensureSubmission(db, data.assignmentId, userId);
    await recalcSubmission(db, submission.id);

    const { data: answers } = await db
      .from("answers")
      .select(
        "id, question_id, answer_text, image_paths, verdict, awarded_marks, feedback, attempts, resolved, rejected_at, rejection_note",
      )
      .eq("submission_id", submission.id);

    const answersWithImages = await Promise.all(
      (answers ?? []).map(async (a) => ({
        ...a,
        imageUrls: await signWorkImages(db, a.image_paths ?? []),
      })),
    );

    const answerIds = (answers ?? []).map((a) => a.id);
    const { data: messages } = answerIds.length
      ? await db
          .from("tutor_messages")
          .select("id, answer_id, role, content, created_at")
          .in("answer_id", answerIds)
          .order("created_at")
      : { data: [] };

    const { tutorSettingsForAssignment } = await import("./tutor-settings.server");
    const tutorSettings = await tutorSettingsForAssignment(db, data.assignmentId, userId);

    return {
      tutorSettings,
      assignment: {
        id: assignment.id,
        title: assignment.title,
        subject: assignment.subject,
        curriculum: assignment.curriculum,
        instructions: assignment.instructions,
        dueAt: access.dueAt,
        dueOverridden: access.dueOverridden,
        pastDue: access.pastDue,
        markSchemeRevealed: access.markSchemeRevealed,
        classId: assignment.class_id,
        className: klass?.name ?? "",

      },
      questions: await Promise.all(
        (questions ?? []).map(async (q) => ({
          id: q.id,
          position: q.position,
          question_text: q.question_text,
          marks: q.marks,
          image_paths: q.image_paths,
          markScheme: access.markSchemeRevealed ? q.mark_scheme : null,
          answerImagePaths: access.markSchemeRevealed ? (q.answer_image_paths ?? []) : [],
          answerImageUrls: access.markSchemeRevealed
            ? await signPaperPages(db, q.answer_image_paths ?? [])
            : [],
          photoMode: resolvePhotoMode({
            student: access.studentPhotoMode,
            question: q.photo_mode as string | null,
            assignment: access.assignmentPhotoMode,
          }),
          imageUrls: await signPaperPages(db, q.image_paths ?? []),
          tagLabel: q.tag_label ?? "",
          tagImage: q.tag_image ?? "",
        })),
      ),

      submission,
      answers: answersWithImages,
      messages: messages ?? [],
    };
  });


export const gradeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        questionId: z.string().uuid(),
        answerText: z.string(),
        imagePaths: z.array(z.string()).max(6).optional(),
        timeSpentSeconds: z.number().int().min(0).max(60 * 60 * 6).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const imagePaths = (data.imagePaths ?? []).filter((path) => path.startsWith(`${userId}/`));
    if (!data.answerText.trim() && imagePaths.length === 0) {
      throw new Error("Write an answer or attach a photo of your working.");
    }
    if (!isEnglishOnly(data.answerText)) throw new Error(ENGLISH_ONLY_MESSAGE);

    const { data: allowed } = await supabase.rpc("can_study_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("This assignment is not available to you.");

    const db = await admin();
    const { data: question, error: qError } = await db
      .from("questions")
      .select("id, question_text, mark_scheme, marks, assignment_id, image_paths")
      .eq("id", data.questionId)
      .single();
    if (qError) throw new Error(qError.message);
    if (question.assignment_id !== data.assignmentId) throw new Error("Question mismatch.");

    const { data: assignmentRow } = await db
      .from("assignments")
      .select("subject, curriculum, class_id")
      .eq("id", data.assignmentId)
      .single();
    const assignment = assignmentRow!;

    // Scaffolding: teachers can cap how many tries a question allows.
    const { tutorSettingsForAssignment } = await import("./tutor-settings.server");
    const scaffolding = await tutorSettingsForAssignment(db, data.assignmentId, userId);
    if (scaffolding.maxAttempts > 0) {
      const { data: priorSubmission } = await db
        .from("submissions")
        .select("id")
        .eq("assignment_id", data.assignmentId)
        .eq("student_id", userId)
        .maybeSingle();
      const { data: prior } = priorSubmission
        ? await db
            .from("answers")
            .select("attempts")
            .eq("submission_id", priorSubmission.id)
            .eq("question_id", data.questionId)
            .maybeSingle()
        : { data: null };
      const used = Number((prior as { attempts?: number } | null)?.attempts ?? 0);
      if (used >= scaffolding.maxAttempts) {
        throw new Error(
          `You have used all ${scaffolding.maxAttempts} tries your teacher allowed for this question.`,
        );
      }
    }

    const { data: classRow } = await db
      .from("classes")
      .select("ai_warning_limit")
      .eq("id", assignment.class_id)
      .maybeSingle();
    const warningLimit = classRow?.ai_warning_limit ?? 3;

    const access = await studentAccess(db, data.assignmentId, userId);
    if (access.pastDue) throw new Error(PAST_DUE_MESSAGE);

    const guardSubmission = await ensureSubmission(db, data.assignmentId, userId);
    if (guardSubmission.locked_at) throw new Error(LOCKED_MESSAGE);


    /* ---- academic integrity: reject copied AI / web / peer answers ---- */
    const [{ detectAiAnswer }, { findCopiedFromPeers }, { checkHandDrawnPhotos }] =
      await Promise.all([
        import("./ai-detect.server"),
        import("./originality.server"),
        import("./photo-authenticity.server"),
      ]);
    const [detection, peerCopy, photoCheck] = await Promise.all([
      detectAiAnswer({
        question: question.question_text,
        answer: data.answerText,
        marks: question.marks,
      }),
      findCopiedFromPeers(db, data.questionId, guardSubmission.id, data.answerText),
      // Work drawn on the app's own writing pad is the student's own hand — it
      // is digital ink on a white sheet, so it never goes to the photo check.
      checkHandDrawnPhotos(
        await signWorkImages(
          db,
          imagePaths.filter((path) => !path.endsWith("working-pad.png")),
        ),
      ),

    ]);
    const violation = photoCheck.ok
      ? (peerCopy ?? (detection.isAi ? detection : null))
      : { reason: photoCheck.reason, confidence: photoCheck.confidence };
    if (violation) {
      const strikes = (guardSubmission.ai_flag_count ?? 0) + 1;
      await db.from("integrity_flags").insert({
        submission_id: guardSubmission.id,
        question_id: data.questionId,
        reason: violation.reason,
        excerpt: data.answerText.slice(0, 600),
        confidence: violation.confidence,
      });
      const locked = strikes > warningLimit;
      await db
        .from("submissions")
        .update({
          ai_flag_count: strikes,
          ...(locked
            ? {
                locked_at: new Date().toISOString(),
                locked_reason: `Answer ${strikes} was detected as AI-generated, copied or plagiarised (class limit: ${warningLimit} warning${warningLimit === 1 ? "" : "s"}).`,
              }
            : {}),
        })
        .eq("id", guardSubmission.id);
      if (locked) {
        await recalcSubmission(db, guardSubmission.id);
        throw new Error(LOCKED_MESSAGE);
      }
      throw new Error(
        `${violation.reason} This answer was not accepted — write it in your own words. Warning ${strikes} of ${warningLimit} — one more copied answer locks this homework and marks it as a fail until your teacher unlocks it.`,
      );

    }


    const imageUrls = await signWorkImages(db, imagePaths);

    const { markStudentAnswer } = await import("./marking.server");
    const result = await markStudentAnswer({
      curriculum: assignment.curriculum,
      subject: assignment.subject,
      question: question.question_text,
      markScheme: question.mark_scheme,
      marks: question.marks,
      answer: data.answerText,
      imageUrls,
      questionImageUrls: await signPaperPages(db, question.image_paths ?? []),
    });


    const submission = await ensureSubmission(db, data.assignmentId, userId);
    const { data: existing } = await db
      .from("answers")
      .select("id, attempts, time_spent_seconds, attempt_history")
      .eq("submission_id", submission.id)
      .eq("question_id", data.questionId)
      .maybeSingle();

    const history = Array.isArray(existing?.attempt_history)
      ? (existing!.attempt_history as Record<string, unknown>[])
      : [];
    const attemptEntry = {
      at: new Date().toISOString(),
      answer_text: data.answerText,
      image_paths: imagePaths,
      verdict: result.verdict,
      awarded_marks: result.awardedMarks,
      feedback: result.feedback,
    };

    const payload = {
      submission_id: submission.id,
      attempt_history: [...history, attemptEntry].slice(-30) as unknown as Json,
      question_id: data.questionId,
      answer_text: data.answerText,
      image_paths: imagePaths,
      verdict: result.verdict,
      awarded_marks: result.awardedMarks,
      feedback: result.feedback,
      attempts: (existing?.attempts ?? 0) + 1,
      time_spent_seconds:
        (existing?.time_spent_seconds ?? 0) + Math.round(data.timeSpentSeconds ?? 0),
      mark_breakdown: result.markPoints ?? [],
      resolved: result.verdict === "correct",
      rejected_at: null,
      rejected_by: null,
      rejection_note: null,
      updated_at: new Date().toISOString(),
    };

    const { data: answer, error } = existing
      ? await db.from("answers").update(payload).eq("id", existing.id).select("id").single()
      : await db.from("answers").insert(payload).select("id").single();
    if (error) throw new Error(error.message);

    if (result.verdict !== "correct" && result.leadingQuestion) {
      await db.from("tutor_messages").insert({
        answer_id: answer.id,
        role: "tutor",
        content: result.leadingQuestion,
      });
    }

    await recalcSubmission(db, submission.id);
    return {
      answerId: answer.id,
      verdict: result.verdict,
      awardedMarks: result.awardedMarks,
      feedback: result.feedback,
      leadingQuestion: result.leadingQuestion,
    };
  });

export const extractPaperQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        subject: z.string().default(""),
        paperFiles: z
          .array(
            z.object({
              filename: z.string(),
              mimeType: z.string(),
              base64: z.string().min(1),
            }),
          )
          .min(1)
          .max(30),
        markSchemeFiles: z
          .array(
            z.object({
              filename: z.string(),
              mimeType: z.string(),
              base64: z.string().min(1),
            }),
          )
          .max(30)
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: klass, error } = await supabase
      .from("classes")
      .select("id, teacher_id, curriculum")
      .eq("id", data.classId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!klass || !(await teachesClass(supabase, klass.id, userId))) {
      throw new Error("You do not teach this class.");
    }

    const { extractQuestionsFromPapers } = await import("./paper-extract.server");
    const extraction = await extractQuestionsFromPapers({
      curriculum: klass.curriculum,
      subject: data.subject,
      paperFiles: data.paperFiles,
      markSchemeFiles: data.markSchemeFiles,
    });
    const questions = extraction.questions;
    if (questions.length === 0) {
      throw new Error("No questions could be read from those files. Try clearer or fewer pages.");
    }

    // Keep the original paper pages so figures, diagrams and equations are shown
    // to students exactly as printed instead of being described in words.
    const db = await admin();
    const folder = `${data.classId}/${Date.now()}`;
    const pagePaths: Record<number, string> = {};
    for (const [index, file] of data.paperFiles.entries()) {
      if (!file.mimeType.startsWith("image/")) continue;
      const pageNumber = index + 1;
      const path = `${folder}/page-${pageNumber}.jpg`;
      const bytes = decodeBase64(file.base64);
      const { error: upError } = await db.storage
        .from("paper-pages")
        .upload(path, bytes, { contentType: file.mimeType, upsert: true });
      if (!upError) pagePaths[pageNumber] = path;
    }

    const answerPagePaths: Record<number, string> = {};
    for (const [index, file] of data.markSchemeFiles.entries()) {
      if (!file.mimeType.startsWith("image/")) continue;
      const pageNumber = index + 1;
      // "ms-" keeps these pages recognisable as answer pages so they can never
      // be shown in place of a question picture.
      const path = `${folder}/ms-page-${pageNumber}.jpg`;
      const bytes = decodeBase64(file.base64);
      const { error: upError } = await db.storage
        .from("paper-pages")
        .upload(path, bytes, { contentType: file.mimeType, upsert: true });
      if (!upError) answerPagePaths[pageNumber] = path;
    }

    const withPages = await Promise.all(
      questions.map(async (q) => {
        // When the AI could locate the question on its page, keep only that
        // page and remember the band to snip, so the student sees the printed
        // question itself (tables, options, diagrams) and nothing else.
        const crops = (q.crops ?? []).filter((crop) => Boolean(pagePaths[crop.page]));
        // Never fall back to a whole page. A mixed teacher document can hold
        // the next sub-part, a repeated question and its mark scheme on that
        // same page. If no safe crop was found, the exact transcribed wording
        // is safer than exposing unrelated or answer content.
        const paths = crops.map(
          (crop) =>
            `${pagePaths[crop.page]}#crop=${crop.top.toFixed(4)},${crop.bottom.toFixed(4)}`,
        );
        // The official answer is kept as a picture too, so ticks, fractions and
        // marking notation stay exactly as printed. Answers are only ever shown
        // to a student once the teacher releases the mark scheme.
        const answerPaths = (q.answerCrops ?? [])
          .map((crop) => {
            const page =
              (crop.sheet ?? "paper") === "answer"
                ? answerPagePaths[crop.page]
                : pagePaths[crop.page];
            if (!page) return null;
            return `${page}#crop=${crop.top.toFixed(4)},${crop.bottom.toFixed(4)}`;
          })
          .filter((path): path is string => Boolean(path));
        return {
          questionText: q.questionText,
          markScheme: q.markScheme,
          marks: q.marks,
          imagePaths: paths,
          imageUrls: await signPaperPages(db, paths),
          answerImagePaths: answerPaths,
          answerImageUrls: await signPaperPages(db, answerPaths),
        };
      }),
    );


    return { questions: withPages, warnings: extraction.warnings };
  });

export const sendTutorMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ answerId: z.string().uuid(), message: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: owns } = await supabase.rpc("owns_answer", {
      _answer_id: data.answerId,
      _user_id: userId,
    });
    if (!owns) throw new Error("Not your answer.");
    if (!isEnglishOnly(data.message)) throw new Error("Please ask your question in English.");


    const db = await admin();
    const { data: answerRow } = await db
      .from("answers")
      .select("id, answer_text, question_id, submission_id, awarded_marks, mark_breakdown")
      .eq("id", data.answerId)
      .single();
    const answer = answerRow!;
    const { data: ownerSubmission } = await db
      .from("submissions")
      .select("locked_at")
      .eq("id", answer.submission_id)
      .maybeSingle();
    if (ownerSubmission?.locked_at) throw new Error(LOCKED_MESSAGE);

    const { data: questionRow } = await db
      .from("questions")
      .select("question_text, mark_scheme, marks, assignment_id")
      .eq("id", answer.question_id)
      .single();
    const question = questionRow!;
    const tutorAccess = await studentAccess(db, question.assignment_id, userId);
    if (tutorAccess.pastDue) throw new Error(PAST_DUE_MESSAGE);

    const { data: assignmentRow } = await db
      .from("assignments")
      .select("subject, curriculum")
      .eq("id", question.assignment_id)
      .single();
    const assignment = assignmentRow!;
    const { data: history } = await db
      .from("tutor_messages")
      .select("role, content")
      .eq("answer_id", data.answerId)
      .order("created_at");

    await db
      .from("tutor_messages")
      .insert({ answer_id: data.answerId, role: "student", content: data.message });

    const { tutorSettingsForAssignment } = await import("./tutor-settings.server");
    const tutorPrefs = await tutorSettingsForAssignment(db, question.assignment_id, userId);

    const { tutorStep } = await import("./marking.server");
    const reply = await tutorStep({
      level: tutorPrefs.level,
      language: tutorPrefs.language,
      curriculum: assignment.curriculum,
      subject: assignment.subject,
      question: question.question_text,
      markScheme: question.mark_scheme,
      marks: question.marks,
      studentAnswer: answer.answer_text,
      awardedMarks: answer.awarded_marks ?? 0,
      markBreakdown: Array.isArray(answer.mark_breakdown)
        ? (answer.mark_breakdown as Array<{ point: string; marks: number; awarded: boolean }>)
        : [],
      history: (history ?? []).map((m) => ({
        role: m.role === "tutor" ? ("tutor" as const) : ("student" as const),
        content: m.content,
      })),
      latestMessage: data.message,
    });

    await db
      .from("tutor_messages")
      .insert({ answer_id: data.answerId, role: "tutor", content: reply });

    return { reply };
  });

export const submitAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = await admin();
    const { data: current } = await db
      .from("submissions")
      .select("locked_at, submit_count")
      .eq("assignment_id", data.assignmentId)
      .eq("student_id", userId)
      .maybeSingle();
    if (current?.locked_at) throw new Error(LOCKED_MESSAGE);
    const submitAccess = await studentAccess(db, data.assignmentId, userId);
    if (submitAccess.pastDue) throw new Error(PAST_DUE_MESSAGE);

    // "Take it like a real paper": the whole paper may only be handed in a set number of times.
    const { tutorSettingsForAssignment: paperSettings } = await import("./tutor-settings.server");
    const paperRules = await paperSettings(db, data.assignmentId, userId);
    const used = Number(current?.submit_count ?? 0) || 0;
    if (paperRules.maxPaperSubmissions > 0 && used >= paperRules.maxPaperSubmissions) {
      throw new Error(
        `You have used all ${paperRules.maxPaperSubmissions} hand-ins your teacher allowed for this paper.`,
      );
    }


    const { error } = await supabase
      .from("submissions")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("assignment_id", data.assignmentId)
      .eq("student_id", userId);
    if (error) throw new Error(error.message);

    await db
      .from("submissions")
      .update({ submit_count: used + 1 })
      .eq("assignment_id", data.assignmentId)
      .eq("student_id", userId);

    return { ok: true };
  });

/** Read-only student-eye view of an assignment, for the owning teacher. */
export const getAssignmentPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        studentId: z.string().uuid().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("You don't teach this assignment.");

    const db = await admin();
    const { data: assignmentRow } = await db
      .from("assignments")
      .select(
        "id, title, subject, curriculum, instructions, due_at, class_id, mark_scheme_revealed, photo_mode",
      )
      .eq("id", data.assignmentId)
      .single();
    const assignment = assignmentRow!;
    const { data: klass } = await db
      .from("classes")
      .select("name")
      .eq("id", assignment.class_id)
      .maybeSingle();
    const { data: allPreviewQuestions } = await db
      .from("questions")
      .select(
        "id, position, question_text, marks, image_paths, answer_image_paths, mark_scheme, photo_mode, tag_label, tag_image",
      )
      .eq("assignment_id", data.assignmentId)
      .order("position");

    // Roster, so the teacher can preview the exact settings each student sees.
    const { data: memberRows } = await db
      .from("class_members")
      .select("student_id")
      .eq("class_id", assignment.class_id);
    const memberIds = (memberRows ?? []).map((row: { student_id: string }) => row.student_id);
    const { data: profileRows } = memberIds.length
      ? await db.from("profiles").select("id, full_name").in("id", memberIds)
      : { data: [] as Array<{ id: string; full_name: string }> };
    const students = (profileRows ?? [])
      .map((row: { id: string; full_name: string }) => ({ id: row.id, name: row.full_name }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

    const studentId = data.studentId && memberIds.includes(data.studentId) ? data.studentId : null;

    const pastDue = Boolean(
      assignment.due_at && new Date(assignment.due_at).getTime() < Date.now(),
    );

    const { tutorSettingsForAssignment } = await import("./tutor-settings.server");
    const tutorSettings = await tutorSettingsForAssignment(db, data.assignmentId, studentId);

    // Answers only appear in the preview when they are actually released — for the
    // whole class, or for the student being previewed.
    const { data: studentRelease } = studentId
      ? await db
          .from("student_assignment_settings")
          .select("mark_scheme_revealed")
          .eq("assignment_id", data.assignmentId)
          .eq("student_id", studentId)
          .maybeSingle()
      : { data: null };
    const markSchemeRevealed = Boolean(
      assignment.mark_scheme_revealed || studentRelease?.mark_scheme_revealed,
    );

    // Previewing an SL student hides HL-only questions, exactly as they see it.
    const { data: previewLevelRow } = studentId
      ? await db
          .from("class_student_settings")
          .select("ib_level")
          .eq("class_id", assignment.class_id)
          .eq("student_id", studentId)
          .maybeSingle()
      : { data: null };
    const previewIsStandardLevel =
      (previewLevelRow as { ib_level?: string | null } | null)?.ib_level === "SL";
    const questions = (allPreviewQuestions ?? []).filter(
      (q) => !(previewIsStandardLevel && isHigherLevelTag(q.tag_label as string | null)),
    );

    return {
      tutorSettings,
      students,
      viewingStudentId: studentId,

      assignment: {
        id: assignment.id,
        classId: assignment.class_id,
        title: assignment.title,
        subject: assignment.subject,
        curriculum: assignment.curriculum,
        instructions: assignment.instructions,
        dueAt: assignment.due_at,
        pastDue,
        markSchemeRevealed,
        className: klass?.name ?? "",
      },
      questions: await Promise.all(
        (questions ?? []).map(async (q) => ({
          id: q.id,
          position: q.position,
          question_text: q.question_text,
          marks: q.marks,
          image_paths: q.image_paths,
          markScheme: markSchemeRevealed ? q.mark_scheme : null,

          answerImagePaths: q.answer_image_paths ?? [],
          answerImageUrls: await signPaperPages(db, q.answer_image_paths ?? []),
          photoMode: resolvePhotoMode({
            question: q.photo_mode as string | null,
            assignment: assignment.photo_mode as string | null,
          }),
          imageUrls: await signPaperPages(db, q.image_paths ?? []),
          tagLabel: q.tag_label ?? "",
          tagImage: q.tag_image ?? "",
        })),
      ),

    };
  });


/** Teacher-only trial marking: runs the real AI marker but saves nothing. */
export const previewGradeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        questionId: z.string().uuid(),
        answerText: z.string(),
        imageDataUrls: z.array(z.string().startsWith("data:image/").max(8_000_000)).max(3).optional(),
        priorFlags: z.number().int().min(0).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const previewImages = data.imageDataUrls ?? [];
    if (!data.answerText.trim() && previewImages.length === 0) {
      throw new Error("Type an answer or attach a photo to test the marking.");
    }
    if (!isEnglishOnly(data.answerText)) throw new Error(ENGLISH_ONLY_MESSAGE);


    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("You don't teach this assignment.");

    const db = await admin();
    const { data: question, error: qError } = await db
      .from("questions")
      .select("id, question_text, mark_scheme, marks, assignment_id, image_paths")
      .eq("id", data.questionId)
      .single();
    if (qError) throw new Error(qError.message);
    if (question.assignment_id !== data.assignmentId) throw new Error("Question mismatch.");

    const { data: assignmentRow } = await db
      .from("assignments")
      .select("subject, curriculum, class_id")
      .eq("id", data.assignmentId)
      .single();
    const assignment = assignmentRow!;
    const { data: previewClass } = await db
      .from("classes")
      .select("ai_warning_limit")
      .eq("id", assignment.class_id)
      .maybeSingle();
    const previewLimit = previewClass?.ai_warning_limit ?? 3;

    // Same integrity check students face; strikes are counted in the preview
    // session only (nothing is written to the real submission).
    const [{ detectAiAnswer }, { checkHandDrawnPhotos }] = await Promise.all([
      import("./ai-detect.server"),
      import("./photo-authenticity.server"),
    ]);
    const [previewDetection, previewPhotoCheck] = await Promise.all([
      detectAiAnswer({
        question: question.question_text,
        answer: data.answerText,
        marks: question.marks,
      }),
      checkHandDrawnPhotos(previewImages),
    ]);
    if (!previewPhotoCheck.ok || previewDetection.isAi) {
      const strikes = (data.priorFlags ?? 0) + 1;
      if (strikes > previewLimit) throw new Error(LOCKED_MESSAGE);
      throw new Error(
        `${previewPhotoCheck.ok ? "This answer looks AI-generated or copied, so it was not accepted. Write it in your own words." : previewPhotoCheck.reason} Warning ${strikes} of ${previewLimit} — one more rejected answer locks the homework and marks it as a fail until a teacher unlocks it.`,
      );
    }



    const { markStudentAnswer } = await import("./marking.server");
    const result = await markStudentAnswer({
      curriculum: assignment.curriculum,
      subject: assignment.subject,
      question: question.question_text,
      markScheme: question.mark_scheme,
      marks: question.marks,
      answer: data.answerText,
      imageUrls: previewImages,
      questionImageUrls: await signPaperPages(db, question.image_paths ?? []),
    });

    return {
      verdict: result.verdict,
      awardedMarks: result.awardedMarks,
      totalMarks: question.marks,
      feedback: result.feedback,
      leadingQuestion: result.leadingQuestion ?? "",
      markBreakdown: result.markPoints ?? [],
    };
  });


/** Teacher-only trial tutor chat: same Socratic tutor, nothing saved. */
export const previewTutorMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        questionId: z.string().uuid(),
        studentAnswer: z.string().default(""),
        message: z.string().min(1).max(2000),
        awardedMarks: z.number().optional(),
        markBreakdown: z
          .array(z.object({ point: z.string(), marks: z.number(), awarded: z.boolean() }))
          .max(30)
          .optional(),
        history: z
          .array(z.object({ role: z.enum(["tutor", "student"]), content: z.string() }))
          .max(40)
          .default([]),
        level: z.enum(["beginner", "medium", "advanced"]).optional(),
        language: z.string().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!isEnglishOnly(data.message)) throw new Error("Please ask your question in English.");
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("You don't teach this assignment.");

    const db = await admin();
    const { data: question, error: qError } = await db
      .from("questions")
      .select("question_text, mark_scheme, marks, assignment_id")
      .eq("id", data.questionId)
      .single();
    if (qError) throw new Error(qError.message);
    if (question.assignment_id !== data.assignmentId) throw new Error("Question mismatch.");

    const { data: assignmentRow } = await db
      .from("assignments")
      .select("subject, curriculum")
      .eq("id", data.assignmentId)
      .single();
    const assignment = assignmentRow!;

    const { tutorSettingsForAssignment } = await import("./tutor-settings.server");
    const previewPrefs = await tutorSettingsForAssignment(db, data.assignmentId, null);

    const { tutorStep } = await import("./marking.server");
    const reply = await tutorStep({
      level: data.level ?? previewPrefs.level,
      language: data.language ?? previewPrefs.language,
      curriculum: assignment.curriculum,
      subject: assignment.subject,
      question: question.question_text,
      markScheme: question.mark_scheme,
      marks: question.marks,
      studentAnswer: data.studentAnswer,
      ...(data.awardedMarks != null ? { awardedMarks: data.awardedMarks } : {}),
      ...(data.markBreakdown ? { markBreakdown: data.markBreakdown } : {}),
      history: data.history,
      latestMessage: data.message,
    });
    return { reply };
  });




type AnyClient = Awaited<ReturnType<typeof admin>>;

const SUBMISSION_FIELDS =
  "id, status, awarded_marks, total_marks, submitted_at, ai_flag_count, locked_at, locked_reason, penalty_percent";


async function ensureSubmission(db: AnyClient, assignmentId: string, studentId: string) {
  const { data: existing } = await db
    .from("submissions")
    .select(SUBMISSION_FIELDS)
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (existing) return existing;

  const { data: questions } = await db
    .from("questions")
    .select("marks")
    .eq("assignment_id", assignmentId);
  const totalMarks = (questions ?? []).reduce((sum, q) => sum + q.marks, 0);

  const { data: created, error } = await db
    .from("submissions")
    .insert({ assignment_id: assignmentId, student_id: studentId, total_marks: totalMarks })
    .select(SUBMISSION_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return created;
}

async function recalcSubmission(db: AnyClient, submissionId: string) {
  const [{ data: answers }, { data: submission }] = await Promise.all([
    db.from("answers").select("awarded_marks, question_id").eq("submission_id", submissionId),
    db
      .from("submissions")
      .select("locked_at, penalty_percent, assignment_id, student_id")
      .eq("id", submissionId)
      .maybeSingle(),
  ]);
  if (!submission) return;

  const [{ data: questions }, { data: exclusions }] = await Promise.all([
    db.from("questions").select("id, marks").eq("assignment_id", submission.assignment_id),
    db.from("question_exclusions").select("question_id").eq("student_id", submission.student_id),
  ]);
  const excluded = new Set((exclusions ?? []).map((e) => e.question_id));
  const totalMarks = (questions ?? [])
    .filter((q) => !excluded.has(q.id))
    .reduce((sum, q) => sum + q.marks, 0);

  const raw = (answers ?? [])
    .filter((a) => !excluded.has(a.question_id))
    .reduce((sum, a) => sum + Number(a.awarded_marks), 0);
  const penalty = Number(submission.penalty_percent ?? 0);
  const awarded = submission.locked_at
    ? 0
    : Math.round(raw * (1 - penalty / 100) * 100) / 100;
  await db
    .from("submissions")
    .update({ awarded_marks: awarded, total_marks: totalMarks })
    .eq("id", submissionId);
}

async function recalcAssignment(db: AnyClient, assignmentId: string) {
  const { data: subs } = await db
    .from("submissions")
    .select("id")
    .eq("assignment_id", assignmentId);
  for (const sub of subs ?? []) {
    await recalcSubmission(db, sub.id);
  }
}

/** Teacher guard: resolves a question to its assignment and verifies the caller teaches it. */
async function questionForTeacher(
  supabase: AnyClient,
  db: AnyClient,
  questionId: string,
  userId: string,
) {
  const { data: question } = await db
    .from("questions")
    .select("id, assignment_id, position, marks, question_text")
    .eq("id", questionId)
    .maybeSingle();
  if (!question) throw new Error("Question not found.");
  const { data: allowed } = await supabase.rpc("can_teach_assignment", {
    _assignment_id: question.assignment_id,
    _user_id: userId,
  });
  if (!allowed) throw new Error("Not allowed.");
  return question;
}


async function signPaperPages(db: AnyClient, paths: string[]) {
  if (paths.length === 0) return [];
  // A stored path may carry "#crop=top,bottom" — the band of that page to show.
  const parts = paths.map((path) => {
    const at = path.indexOf("#");
    return at === -1
      ? { path, hash: "" }
      : { path: path.slice(0, at), hash: path.slice(at) };
  });
  const { data } = await db.storage
    .from("paper-pages")
    .createSignedUrls(parts.map((p) => p.path), 60 * 60 * 8);
  return (data ?? [])
    .map((item, index) => (item.signedUrl ? `${item.signedUrl}${parts[index]?.hash ?? ""}` : null))
    .filter((url): url is string => Boolean(url));
}


async function signWorkImages(db: AnyClient, paths: string[]) {
  if (paths.length === 0) return [];
  const { data } = await db.storage.from("student-work").createSignedUrls(paths, 3600);
  return (data ?? []).map((item) => item.signedUrl).filter((url): url is string => Boolean(url));
}

/* ------------------------------------------------- teacher question controls ---- */

/** Teacher-only: questions of an assignment plus which students are exempt from each. */
export const getAssignmentQuestionControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("Not allowed.");

    const db = await admin();
    const { data: assignment } = await db
      .from("assignments")
      .select("id, title, class_id")
      .eq("id", data.assignmentId)
      .single();

    const [{ data: questions }, { data: members }] = await Promise.all([
      db
        .from("questions")
        .select("id, position, question_text, marks, photo_mode")
        .eq("assignment_id", data.assignmentId)
        .order("position"),
      db.from("class_members").select("student_id").eq("class_id", assignment!.class_id),
    ]);

    const studentIds = (members ?? []).map((m) => m.student_id);
    const { data: profiles } = studentIds.length
      ? await db.from("profiles").select("id, full_name, email").in("id", studentIds)
      : { data: [] };

    const questionIds = (questions ?? []).map((q) => q.id);
    const { data: exclusions } = questionIds.length
      ? await db
          .from("question_exclusions")
          .select("question_id, student_id")
          .in("question_id", questionIds)
      : { data: [] };

    return {
      assignmentTitle: assignment!.title,
      questions: (questions ?? []).map((q) => ({
        id: q.id,
        position: q.position,
        marks: q.marks,
        questionText: q.question_text,
        photoMode: isPhotoMode(q.photo_mode) ? q.photo_mode : "auto",
      })),
      students: studentIds.map((id) => {
        const profile = (profiles ?? []).find((p) => p.id === id);
        return { id, name: profile?.full_name || profile?.email || "Student" };
      }),
      exclusions: (exclusions ?? []).map((e) => ({
        questionId: e.question_id,
        studentId: e.student_id,
      })),
    };
  });

/** Teacher-only: photo answers on/off/automatic for a single question. */
export const setQuestionPhotoMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        questionId: z.string().uuid(),
        photoMode: z.enum(["auto", "on", "off"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = await admin();
    const { data: question } = await db
      .from("questions")
      .select("assignment_id")
      .eq("id", data.questionId)
      .single();
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: question!.assignment_id,
      _user_id: userId,
    });
    if (!allowed) throw new Error("Not allowed.");

    const { error } = await db
      .from("questions")
      .update({ photo_mode: data.photoMode })
      .eq("id", data.questionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/** Teacher-only: removes a question from an assignment along with every student answer to it. */
export const deleteQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ questionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = await admin();
    const question = await questionForTeacher(supabase, db, data.questionId, userId);

    const { data: answers } = await db
      .from("answers")
      .select("id")
      .eq("question_id", data.questionId);
    const answerIds = (answers ?? []).map((a) => a.id);
    if (answerIds.length > 0) {
      await db.from("tutor_messages").delete().in("answer_id", answerIds);
      await db.from("answers").delete().in("id", answerIds);
    }
    await db.from("integrity_flags").delete().eq("question_id", data.questionId);
    await db.from("question_exclusions").delete().eq("question_id", data.questionId);
    const { error } = await db.from("questions").delete().eq("id", data.questionId);
    if (error) throw new Error(error.message);

    await recalcAssignment(db, question.assignment_id);
    return { ok: true };
  });

/** Teacher-only: awards full marks on one question to every student in the class. */
export const creditQuestionForAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ questionId: z.string().uuid(), feedback: z.string().max(400).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = await admin();
    const question = await questionForTeacher(supabase, db, data.questionId, userId);

    const { data: assignment } = await db
      .from("assignments")
      .select("class_id")
      .eq("id", question.assignment_id)
      .single();
    const { data: members } = await db
      .from("class_members")
      .select("student_id")
      .eq("class_id", assignment!.class_id);
    const { data: exclusions } = await db
      .from("question_exclusions")
      .select("student_id")
      .eq("question_id", data.questionId);
    const excluded = new Set((exclusions ?? []).map((e) => e.student_id));

    const feedback = data.feedback?.trim() || "Full credit awarded by your teacher.";
    let credited = 0;

    for (const member of members ?? []) {
      if (excluded.has(member.student_id)) continue;
      const submission = await ensureSubmission(db, question.assignment_id, member.student_id);
      const { data: existing } = await db
        .from("answers")
        .select("id")
        .eq("submission_id", submission.id)
        .eq("question_id", data.questionId)
        .maybeSingle();

      const patch = {
        verdict: "correct",
        awarded_marks: question.marks,
        feedback,
        resolved: true,
      };
      if (existing) {
        await db.from("answers").update(patch).eq("id", existing.id);
      } else {
        await db
          .from("answers")
          .insert({ submission_id: submission.id, question_id: data.questionId, ...patch });
      }
      await recalcSubmission(db, submission.id);
      credited += 1;
    }

    return { ok: true, credited };
  });

/** Teacher-only: unassigns (or re-assigns) a single question for one student. */
export const setQuestionExclusion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        questionId: z.string().uuid(),
        studentId: z.string().uuid(),
        excluded: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = await admin();
    const question = await questionForTeacher(supabase, db, data.questionId, userId);

    if (data.excluded) {
      const { error } = await db
        .from("question_exclusions")
        .upsert(
          { question_id: data.questionId, student_id: data.studentId, created_by: userId },
          { onConflict: "question_id,student_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db
        .from("question_exclusions")
        .delete()
        .eq("question_id", data.questionId)
        .eq("student_id", data.studentId);
      if (error) throw new Error(error.message);
    }

    const { data: submission } = await db
      .from("submissions")
      .select("id")
      .eq("assignment_id", question.assignment_id)
      .eq("student_id", data.studentId)
      .maybeSingle();
    if (submission) await recalcSubmission(db, submission.id);

    return { ok: true };
  });

/* ------------------------------------------- due dates & mark schemes ---- */

export const PAST_DUE_MESSAGE =
  "The due date for this homework has passed, so it is now locked. Ask your teacher to extend the due date if you need more time.";

type StudentAccess = {
  dueAt: string | null;
  /** Whether the student-specific due date replaces the class due date. */
  dueOverridden: boolean;
  pastDue: boolean;
  markSchemeRevealed: boolean;
  /** Assignment-level photo setting and the per-student override (if any). */
  assignmentPhotoMode: string | null;
  studentPhotoMode: string | null;
};

/** Effective due date + mark-scheme visibility for one student on one assignment. */
async function studentAccess(
  db: AnyClient,
  assignmentId: string,
  studentId: string,
): Promise<StudentAccess> {
  const [{ data: assignment }, { data: override }] = await Promise.all([
    db
      .from("assignments")
      .select("due_at, mark_scheme_revealed, photo_mode")
      .eq("id", assignmentId)
      .maybeSingle(),
    db
      .from("student_assignment_settings")
      .select("due_at, mark_scheme_revealed, photo_mode")
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId)
      .maybeSingle(),
  ]);
  const dueOverridden = Boolean(override?.due_at);
  const dueAt = (override?.due_at as string | null) ?? (assignment?.due_at as string | null) ?? null;
  return {
    dueAt,
    dueOverridden,
    pastDue: Boolean(dueAt && new Date(dueAt).getTime() < Date.now()),
    markSchemeRevealed: Boolean(assignment?.mark_scheme_revealed || override?.mark_scheme_revealed),
    assignmentPhotoMode: (assignment?.photo_mode as string | null) ?? "auto",
    studentPhotoMode: (override?.photo_mode as string | null) ?? null,
  };
}


/** Teacher view of due dates and mark-scheme reveals for an assignment. */
export const getAssignmentAccessControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("Not allowed.");

    const db = await admin();
    const { data: assignment } = await db
      .from("assignments")
      .select(
        "id, title, class_id, due_at, mark_scheme_revealed, photo_mode, keyword_translation, vocab_translation, vocab_language",
      )
      .eq("id", data.assignmentId)
      .single();

    const { data: members } = await db
      .from("class_members")
      .select("student_id")
      .eq("class_id", assignment!.class_id);
    const studentIds = (members ?? []).map((m) => m.student_id);

    const [{ data: profiles }, { data: settings }] = await Promise.all([
      studentIds.length
        ? db.from("profiles").select("id, full_name, email").in("id", studentIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; email: string | null }> }),
      db
        .from("student_assignment_settings")
        .select("student_id, due_at, mark_scheme_revealed, photo_mode, keyword_translation")
        .eq("assignment_id", data.assignmentId),
    ]);

    return {
      assignmentTitle: assignment!.title,
      dueAt: assignment!.due_at as string | null,
      markSchemeRevealed: Boolean(assignment!.mark_scheme_revealed),
      photoMode: isPhotoMode(assignment!.photo_mode) ? assignment!.photo_mode : "auto",
      keywordTranslation: (assignment!.keyword_translation as boolean | null) ?? null,
      vocabTranslation: assignment!.vocab_translation !== false,
      vocabLanguage: (assignment!.vocab_language as string | null) ?? null,
      students: studentIds.map((id) => {
        const profile = (profiles ?? []).find((p) => p.id === id);
        const setting = (settings ?? []).find((s) => s.student_id === id);
        return {
          id,
          name: profile?.full_name || profile?.email || "Student",
          dueAt: (setting?.due_at as string | null) ?? null,
          markSchemeRevealed: Boolean(setting?.mark_scheme_revealed),
          photoMode: isPhotoMode(setting?.photo_mode) ? setting!.photo_mode : null,
          keywordTranslation: (setting?.keyword_translation as boolean | null) ?? null,
        };
      }),
    };

  });

/** Teacher-only: whole-class due date, mark-scheme reveal and/or photo answers. */
export const setAssignmentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        dueAt: z.string().nullable().optional(),
        markSchemeRevealed: z.boolean().optional(),
        photoMode: z.enum(["auto", "on", "off"]).optional(),
        keywordTranslation: z.boolean().nullable().optional(),
        vocabTranslation: z.boolean().optional(),
        vocabLanguage: z.string().max(60).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("Not allowed.");

    const patch: {
      due_at?: string | null;
      mark_scheme_revealed?: boolean;
      photo_mode?: string;
      keyword_translation?: boolean | null;
      vocab_translation?: boolean;
      vocab_language?: string | null;
    } = {};
    if (data.dueAt !== undefined) patch.due_at = data.dueAt;
    if (data.markSchemeRevealed !== undefined) patch.mark_scheme_revealed = data.markSchemeRevealed;
    if (data.photoMode !== undefined) patch.photo_mode = data.photoMode;
    if (data.keywordTranslation !== undefined) patch.keyword_translation = data.keywordTranslation;
    if (data.vocabTranslation !== undefined) patch.vocab_translation = data.vocabTranslation;
    if (data.vocabLanguage !== undefined) patch.vocab_language = data.vocabLanguage;
    if (Object.keys(patch).length === 0) return { ok: true };


    const db = await admin();
    const { error } = await db.from("assignments").update(patch).eq("id", data.assignmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Teacher-only: per-student due date, mark-scheme reveal and/or photo answers. */
export const setStudentAssignmentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        assignmentId: z.string().uuid(),
        studentId: z.string().uuid(),
        dueAt: z.string().nullable().optional(),
        markSchemeRevealed: z.boolean().optional(),
        photoMode: z.enum(["auto", "on", "off"]).nullable().optional(),
        keywordTranslation: z.boolean().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("can_teach_assignment", {
      _assignment_id: data.assignmentId,
      _user_id: userId,
    });
    if (!allowed) throw new Error("Not allowed.");

    const db = await admin();
    const patch: {
      assignment_id: string;
      student_id: string;
      updated_by: string;
      updated_at: string;
      due_at?: string | null;
      mark_scheme_revealed?: boolean;
      photo_mode?: string | null;
      keyword_translation?: boolean | null;
    } = {
      assignment_id: data.assignmentId,
      student_id: data.studentId,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.dueAt !== undefined) patch.due_at = data.dueAt;
    if (data.markSchemeRevealed !== undefined) patch.mark_scheme_revealed = data.markSchemeRevealed;
    if (data.photoMode !== undefined) patch.photo_mode = data.photoMode;
    if (data.keywordTranslation !== undefined) patch.keyword_translation = data.keywordTranslation;

    const { error } = await db
      .from("student_assignment_settings")
      .upsert(patch, { onConflict: "assignment_id,student_id" });
    if (error) throw new Error(error.message);
    return { ok: true };

  });

/**
 * Teacher toggles the detailed gradebook report (time on task, tutor chats,
 * every attempt). `studentId` omitted sets the whole-class default; with a
 * `studentId`, `enabled: null` clears the override back to the class default.
 */
export const setGradebookDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        classId: z.string().uuid(),
        studentId: z.string().uuid().optional(),
        enabled: z.boolean().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: userId,
    });
    if (!isTeacher) throw new Error("Not allowed.");

    const db = await admin();
    if (!data.studentId) {
      const { error } = await db
        .from("classes")
        .update({ gradebook_detail: data.enabled !== false })
        .eq("id", data.classId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const { data: existing } = await db
      .from("class_student_settings")
      .select("id")
      .eq("class_id", data.classId)
      .eq("student_id", data.studentId)
      .maybeSingle();

    const patch = { gradebook_detail: data.enabled, updated_by: userId, updated_at: new Date().toISOString() };
    const { error } = existing
      ? await db.from("class_student_settings").update(patch).eq("id", existing.id)
      : await db
          .from("class_student_settings")
          .insert({ class_id: data.classId, student_id: data.studentId, ...patch });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
