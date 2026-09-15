import { DEFAULT_TUTOR_LANGUAGE, DEFAULT_TUTOR_LEVEL, isTutorLevel } from "./tutor-settings";

type Db = {
  from: (table: string) => any;
};

export type EffectiveTutorSettings = {
  language: string;
  level: "beginner" | "medium" | "advanced";
  /** Student may change their own tutor level. */
  studentCanChangeLevel: boolean;
  /** Copy/paste + screenshot deterrents on question content. */
  protectQuestions: boolean;
  /** Hover-to-see gloss on key words in the question. */
  keywordTranslation: boolean;
  /** Show translations inside the vocab list sheet. */
  vocabTranslation: boolean;
  /** Language used for the vocab list (may differ from the tutor language). */
  vocabLanguage: string;
  /** "Give me a hint" button available to the student. */
  allowHint: boolean;
  /** "Break it down step-by-step" button available to the student. */
  allowSteps: boolean;
  /** Maximum answer attempts per question; 0 means unlimited. */
  maxAttempts: number;
  /** Maximum attempts on multiple-choice questions; 0 means "same as maxAttempts". */
  maxChoiceAttempts: number;
  /** Grade typed calculation answers by their verified final value only. */
  checkFinalNumericOnly: boolean;
  /** Exam conditions: no hints, no step-by-step help. */
  examMode: boolean;
  /** Times the whole paper may be handed in; 0 means unlimited. */
  maxPaperSubmissions: number;
};

export const CLASS_SETTINGS_FIELDS =
  "tutor_language, tutor_level, protect_questions, keyword_translation, student_can_change_level, vocab_translation, vocab_language, allow_hint, allow_steps, max_answer_attempts, max_choice_attempts, check_final_numeric_only, exam_mode, max_paper_submissions";
const LEGACY_CLASS_SETTINGS_FIELDS = CLASS_SETTINGS_FIELDS.replace(
  ", check_final_numeric_only",
  "",
);

function isMissingFastCheckColumn(error: { message?: string } | null | undefined) {
  return /check_final_numeric_only/i.test(error?.message ?? "");
}

/** Class defaults with the per-student override applied. */
export async function effectiveTutorSettings(
  db: Db,
  classId: string,
  studentId: string | null,
): Promise<EffectiveTutorSettings> {
  let [classResult, override] = await Promise.all([
    db.from("classes").select(CLASS_SETTINGS_FIELDS).eq("id", classId).maybeSingle(),
    studentId
      ? db
          .from("class_student_settings")
          .select("tutor_language, tutor_level, student_can_change_level, keyword_translation")
          .eq("class_id", classId)
          .eq("student_id", studentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (isMissingFastCheckColumn(classResult.error)) {
    classResult = await db
      .from("classes")
      .select(LEGACY_CLASS_SETTINGS_FIELDS)
      .eq("id", classId)
      .maybeSingle();
  }
  const klass = classResult.data;
  const row = override?.data ?? null;
  const level = row?.tutor_level ?? klass?.tutor_level ?? DEFAULT_TUTOR_LEVEL;
  const language = row?.tutor_language ?? klass?.tutor_language ?? DEFAULT_TUTOR_LANGUAGE;
  const vocabTranslation = klass?.vocab_translation !== false;
  return {
    language,
    level: isTutorLevel(level) ? level : DEFAULT_TUTOR_LEVEL,
    studentCanChangeLevel: Boolean(
      row?.student_can_change_level ?? klass?.student_can_change_level ?? false,
    ),
    protectQuestions: Boolean(klass?.protect_questions),
    keywordTranslation: Boolean(row?.keyword_translation ?? klass?.keyword_translation ?? false),
    vocabTranslation,
    vocabLanguage: (klass?.vocab_language as string | null) || language,
    allowHint: klass?.allow_hint !== false,
    allowSteps: klass?.allow_steps !== false,
    maxAttempts: Math.max(0, Number(klass?.max_answer_attempts ?? 0) || 0),
    maxChoiceAttempts: Math.max(0, Number(klass?.max_choice_attempts ?? 1) || 0),
    checkFinalNumericOnly: Boolean(klass?.check_final_numeric_only),
    examMode: Boolean(klass?.exam_mode),
    maxPaperSubmissions: Math.max(0, Number(klass?.max_paper_submissions ?? 0) || 0),
  };
}

/**
 * Same, resolved from an assignment id, with the assignment-level and
 * per-student-per-assignment overrides applied on top of the class defaults.
 * Precedence for keyword hover translation:
 * student+assignment → student (overall) → assignment → class default.
 */
export async function tutorSettingsForAssignment(
  db: Db,
  assignmentId: string,
  studentId: string | null,
): Promise<EffectiveTutorSettings> {
  let assignmentResult = await db
    .from("assignments")
    .select(
      "class_id, keyword_translation, vocab_translation, vocab_language, protect_questions, allow_hint, allow_steps, max_answer_attempts, max_choice_attempts, check_final_numeric_only, exam_mode, max_paper_submissions",
    )
    .eq("id", assignmentId)
    .maybeSingle();
  if (isMissingFastCheckColumn(assignmentResult.error)) {
    assignmentResult = await db
      .from("assignments")
      .select(
        "class_id, keyword_translation, vocab_translation, vocab_language, protect_questions, allow_hint, allow_steps, max_answer_attempts, max_choice_attempts, exam_mode, max_paper_submissions",
      )
      .eq("id", assignmentId)
      .maybeSingle();
  }
  const assignment = assignmentResult.data;
  if (!assignment?.class_id) {
    return {
      language: DEFAULT_TUTOR_LANGUAGE,
      level: DEFAULT_TUTOR_LEVEL,
      studentCanChangeLevel: false,
      protectQuestions: false,
      keywordTranslation: false,
      vocabTranslation: true,
      vocabLanguage: DEFAULT_TUTOR_LANGUAGE,
      allowHint: true,
      allowSteps: true,
      maxAttempts: 0,
      maxChoiceAttempts: 1,
      checkFinalNumericOnly: false,
      examMode: false,
      maxPaperSubmissions: 0,
    };
  }

  let [base, studentOverride, classOverride] = await Promise.all([
    effectiveTutorSettings(db, assignment.class_id, studentId),
    studentId
      ? db
          .from("student_assignment_settings")
          .select(
            "keyword_translation, allow_hint, allow_steps, max_answer_attempts, max_choice_attempts, check_final_numeric_only, exam_mode, max_paper_submissions",
          )
          .eq("assignment_id", assignmentId)
          .eq("student_id", studentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    studentId
      ? db
          .from("class_student_settings")
          .select("keyword_translation")
          .eq("class_id", assignment.class_id)
          .eq("student_id", studentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (isMissingFastCheckColumn(studentOverride?.error)) {
    studentOverride = studentId
      ? await db
          .from("student_assignment_settings")
          .select(
            "keyword_translation, allow_hint, allow_steps, max_answer_attempts, max_choice_attempts, exam_mode, max_paper_submissions",
          )
          .eq("assignment_id", assignmentId)
          .eq("student_id", studentId)
          .maybeSingle()
      : { data: null };
  }

  const chain = [
    studentOverride?.data?.keyword_translation,
    classOverride?.data?.keyword_translation,
    assignment.keyword_translation,
    base.keywordTranslation,
  ] as Array<boolean | null | undefined>;
  const keywordTranslation = Boolean(chain.find((value) => value === true || value === false));

  // Scaffolding: student+assignment override → assignment → class default.
  const pickBool = (...values: Array<boolean | null | undefined>) => {
    const found = values.find((value) => value === true || value === false);
    return found === undefined ? null : found;
  };
  const pickNumber = (...values: Array<number | null | undefined>) => {
    const found = values.find((value) => typeof value === "number" && !Number.isNaN(value));
    return found === undefined ? null : (found as number);
  };
  const allowHint =
    pickBool(studentOverride?.data?.allow_hint, assignment.allow_hint) ?? base.allowHint;
  const allowSteps =
    pickBool(studentOverride?.data?.allow_steps, assignment.allow_steps) ?? base.allowSteps;
  const maxAttempts =
    pickNumber(studentOverride?.data?.max_answer_attempts, assignment.max_answer_attempts) ??
    base.maxAttempts;
  const maxChoiceAttempts =
    pickNumber(studentOverride?.data?.max_choice_attempts, assignment.max_choice_attempts) ??
    base.maxChoiceAttempts;
  const checkFinalNumericOnly =
    pickBool(
      studentOverride?.data?.check_final_numeric_only,
      assignment.check_final_numeric_only,
    ) ?? base.checkFinalNumericOnly;
  const examMode =
    pickBool(studentOverride?.data?.exam_mode, assignment.exam_mode) ?? base.examMode;
  const maxPaperSubmissions =
    pickNumber(studentOverride?.data?.max_paper_submissions, assignment.max_paper_submissions) ??
    base.maxPaperSubmissions;

  return {
    ...base,
    keywordTranslation,
    // Under exam conditions the scaffolding helpers are always off.
    allowHint: examMode ? false : allowHint,
    allowSteps: examMode ? false : allowSteps,
    maxAttempts: Math.max(0, maxAttempts || 0),
    maxChoiceAttempts: Math.max(0, maxChoiceAttempts || 0),
    checkFinalNumericOnly,
    examMode,
    maxPaperSubmissions: Math.max(0, maxPaperSubmissions || 0),
    // Copying question wording is always blocked on the student homework portal.
    protectQuestions: true,
    // Class switch is the default; a homework can only turn translations further off.
    vocabTranslation: base.vocabTranslation && assignment.vocab_translation !== false,
    vocabLanguage: (assignment.vocab_language as string | null) ?? base.vocabLanguage,
  };
}
