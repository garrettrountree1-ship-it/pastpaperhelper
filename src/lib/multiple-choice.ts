/**
 * Multiple-choice questions can be brute-forced: with four printed options a
 * student who is allowed four tries is guaranteed the mark. Teachers therefore
 * get a separate, smaller try limit for these questions.
 *
 * A question counts as multiple choice when the teacher says so; when they
 * leave it on "work it out", the printed official answer decides — mark schemes
 * for these questions are a bare option letter ("A", "1 = C", "Answer: B").
 */

import { extractChoiceAnswer } from "./deterministic-marking";

/** True when the printed answer is nothing but an option letter. */
export function looksMultipleChoice(markScheme: string | null | undefined): boolean {
  const text = (markScheme ?? "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 240) return false;
  const startsWithPrintedChoice =
    /^(?:(?:answer|option)\s*[:=]?\s*|\d{1,3}\s*[=:]\s*)?[a-e](?:\s*(?:\(\s*1\s*marks?\s*\)|[-–—:]|$))/i.test(
      text,
    );
  return startsWithPrintedChoice && extractChoiceAnswer(text) !== null;
}

/** The teacher's per-question choice wins; null means "work it out". */
export function isMultipleChoice(
  override: boolean | null | undefined,
  markScheme: string | null | undefined,
): boolean {
  if (override === true || override === false) return override;
  return looksMultipleChoice(markScheme);
}

/** Tries allowed for one question: the smaller multiple-choice cap when it applies. */
export function attemptsAllowed(input: {
  multipleChoice: boolean;
  maxAttempts: number;
  maxChoiceAttempts: number;
}): number {
  if (!input.multipleChoice) return input.maxAttempts;
  const choice = Math.max(0, input.maxChoiceAttempts || 0);
  if (choice === 0) return input.maxAttempts;
  // Never hand out more tries than the general limit already allows.
  return input.maxAttempts > 0 ? Math.min(choice, input.maxAttempts) : choice;
}
