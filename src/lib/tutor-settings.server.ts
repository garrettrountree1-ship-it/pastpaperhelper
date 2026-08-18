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
};

export const CLASS_SETTINGS_FIELDS =
  "tutor_language, tutor_level, protect_questions, keyword_translation, student_can_change_level";

/** Class defaults with the per-student override applied. */
export async function effectiveTutorSettings(
  db: Db,
  classId: string,
  studentId: string | null,
): Promise<EffectiveTutorSettings> {
  const [{ data: klass }, override] = await Promise.all([
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
  const row = override?.data ?? null;
  const level = row?.tutor_level ?? klass?.tutor_level ?? DEFAULT_TUTOR_LEVEL;
  const language = row?.tutor_language ?? klass?.tutor_language ?? DEFAULT_TUTOR_LANGUAGE;
  return {
    language,
    level: isTutorLevel(level) ? level : DEFAULT_TUTOR_LEVEL,
    studentCanChangeLevel: Boolean(
      row?.student_can_change_level ?? klass?.student_can_change_level ?? false,
    ),
    protectQuestions: Boolean(klass?.protect_questions),
    keywordTranslation: Boolean(row?.keyword_translation ?? klass?.keyword_translation ?? false),
    vocabTranslation: true,
    vocabLanguage: language,
  };
}

/**
 * Same, resolved from an assignment id, with the assignment-level and
 * per-student-per-assignment overrides applied on top of the class defaults.
 * Precedence for keyword hover translation:
 * student+assignment → student+class → assignment → class.
 */
export async function tutorSettingsForAssignment(
  db: Db,
  assignmentId: string,
  studentId: string | null,
): Promise<EffectiveTutorSettings> {
  const { data: assignment } = await db
    .from("assignments")
    .select("class_id, keyword_translation, vocab_translation, vocab_language")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment?.class_id) {
    return {
      language: DEFAULT_TUTOR_LANGUAGE,
      level: DEFAULT_TUTOR_LEVEL,
      studentCanChangeLevel: false,
      protectQuestions: false,
      keywordTranslation: false,
      vocabTranslation: true,
      vocabLanguage: DEFAULT_TUTOR_LANGUAGE,
    };
  }

  const [base, studentOverride] = await Promise.all([
    effectiveTutorSettings(db, assignment.class_id, studentId),
    studentId
      ? db
          .from("student_assignment_settings")
          .select("keyword_translation")
          .eq("assignment_id", assignmentId)
          .eq("student_id", studentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const perStudent = studentOverride?.data?.keyword_translation as boolean | null | undefined;
  const perAssignment = assignment.keyword_translation as boolean | null | undefined;

  return {
    ...base,
    keywordTranslation:
      perStudent ?? (perAssignment === null || perAssignment === undefined
        ? base.keywordTranslation
        : perAssignment),
    vocabTranslation: assignment.vocab_translation !== false,
    vocabLanguage: (assignment.vocab_language as string | null) ?? base.language,
  };
}
