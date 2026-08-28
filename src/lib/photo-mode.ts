import { isPhotoOnlyQuestion, needsPhotoAnswer } from "./needs-photo";

/**
 * Teacher control over photo answers.
 * - `auto`  — the app decides from the question wording (calculations and
 *             drawings are photo-only, everything else is typed).
 * - `on`    — photo upload / drawing pad is always offered.
 * - `off`   — photo answers are disabled; the student types the answer.
 */
export type PhotoMode = "auto" | "on" | "off";

export const PHOTO_MODES: Array<{ value: PhotoMode; label: string; hint: string }> = [
  { value: "auto", label: "Automatic", hint: "Photos only on drawing and calculation questions" },
  { value: "on", label: "Always on", hint: "Photo upload and drawing pad offered on every question" },
  { value: "off", label: "Off", hint: "No photo answers — students type their answer" },
];

export function isPhotoMode(value: unknown): value is PhotoMode {
  return value === "auto" || value === "on" || value === "off";
}

/**
 * Most specific wins: the per-student override, then the question, then the
 * assignment. `auto` at every level falls back to the wording heuristic.
 */
export function resolvePhotoMode(layers: {
  student?: string | null;
  question?: string | null;
  assignment?: string | null;
}): PhotoMode {
  for (const layer of [layers.student, layers.question, layers.assignment]) {
    if (isPhotoMode(layer) && layer !== "auto") return layer;
  }
  return "auto";
}

export type PhotoAvailability = {
  /** Highlight the photo/writing-pad input as the expected route for this question. */
  requiresPhoto: boolean;
  /**
   * Kept for compatibility. Students always get all three routes (typing,
   * photo, writing pad), so nothing is ever photo-only.
   */
  photoOnly: boolean;
};

/**
 * Every question offers a text box, a photo (upload or camera) and the writing
 * pad. `requiresPhoto` only decides which route is nudged as the natural one —
 * drawing and calculation questions still suggest paper, but never block typing.
 */
export function photoAvailability(questionText: string, mode: PhotoMode): PhotoAvailability {
  if (mode === "off") return { requiresPhoto: false, photoOnly: false };
  if (mode === "on") return { requiresPhoto: true, photoOnly: false };
  return {
    requiresPhoto: needsPhotoAnswer(questionText) || isPhotoOnlyQuestion(questionText),
    photoOnly: false,
  };
}
