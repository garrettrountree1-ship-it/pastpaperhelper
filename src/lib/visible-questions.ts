import { isHigherLevelTag } from "@/lib/ib-level.functions";

type VisibleQuestion = { id: string; marks: number; tag_label?: string | null };

/**
 * One definition of a student's active homework: explicit exclusions always
 * win, and SL students in an IBDP class do not receive HL-only questions.
 */
export function activeQuestionsForStudent<T extends VisibleQuestion>(
  questions: T[],
  excludedQuestionIds: ReadonlySet<string>,
  options: { ibdp: boolean; level: string | null | undefined },
): T[] {
  const standardLevel = options.ibdp && options.level === "SL";
  return questions.filter(
    (question) =>
      !excludedQuestionIds.has(question.id) &&
      !(standardLevel && isHigherLevelTag(question.tag_label)),
  );
}

export function activeTotalMarks<T extends VisibleQuestion>(questions: T[]): number {
  return questions.reduce((sum, question) => sum + Number(question.marks), 0);
}
