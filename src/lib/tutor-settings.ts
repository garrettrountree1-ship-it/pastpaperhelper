/** Shared tutor differentiation options (teacher-controlled, per class or per student). */

export const TUTOR_LEVELS = [
  {
    value: "beginner",
    label: "Beginner",
    hint: "Very short, simple language. Extra scaffolding, one small step at a time.",
  },

  {
    value: "medium",
    label: "Medium",
    hint: "Normal exam-style coaching with clear explanations.",
  },
  {
    value: "advanced",
    label: "Advanced",
    hint: "Longer, more technical prompts that expect independent reasoning.",
  },
] as const;

export type TutorLevel = (typeof TUTOR_LEVELS)[number]["value"];

export const TUTOR_LANGUAGES = [
  "English",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Spanish",
  "Portuguese",
  "French",
  "German",
  "Arabic",
  "Korean",
  "Japanese",
  "Vietnamese",
  "Thai",
  "Russian",
  "Hindi",
] as const;

export type TutorLanguage = (typeof TUTOR_LANGUAGES)[number];

export const DEFAULT_TUTOR_LEVEL: TutorLevel = "medium";
export const DEFAULT_TUTOR_LANGUAGE = "English";

export function tutorLevelLabel(value: string): string {
  return TUTOR_LEVELS.find((level) => level.value === value)?.label ?? "Medium";
}

export function isTutorLevel(value: unknown): value is TutorLevel {
  return TUTOR_LEVELS.some((level) => level.value === value);
}
