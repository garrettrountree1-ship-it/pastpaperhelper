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
  /** Hover-to-see Chinese gloss on key words. */
  keywordTranslation: boolean;
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
          .select("tutor_language, tutor_level, student_can_change_level")
          .eq("class_id", classId)
          .eq("student_id", studentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const row = override?.data ?? null;
  const level = row?.tutor_level ?? klass?.tutor_level ?? DEFAULT_TUTOR_LEVEL;
  return {
    language: row?.tutor_language ?? klass?.tutor_language ?? DEFAULT_TUTOR_LANGUAGE,
    level: isTutorLevel(level) ? level : DEFAULT_TUTOR_LEVEL,
    studentCanChangeLevel: Boolean(
      row?.student_can_change_level ?? klass?.student_can_change_level ?? false,
    ),
    protectQuestions: Boolean(klass?.protect_questions),
    keywordTranslation: Boolean(klass?.keyword_translation),
  };
}

/** Same, resolved from an assignment id. */
export async function tutorSettingsForAssignment(
  db: Db,
  assignmentId: string,
  studentId: string | null,
): Promise<EffectiveTutorSettings> {
  const { data: assignment } = await db
    .from("assignments")
    .select("class_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment?.class_id) {
    return {
      language: DEFAULT_TUTOR_LANGUAGE,
      level: DEFAULT_TUTOR_LEVEL,
      studentCanChangeLevel: false,
      protectQuestions: false,
      keywordTranslation: false,
    };
  }
  return effectiveTutorSettings(db, assignment.class_id, studentId);
}
