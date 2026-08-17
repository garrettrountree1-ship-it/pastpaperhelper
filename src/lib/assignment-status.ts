export type AssignmentStatusKey = "active" | "closed" | "past_due";

export type AssignmentStatusInput = {
  dueAt: string | null;
  answeredCount: number;
  questionCount: number;
};

/**
 * active   – due date not reached (or no due date)
 * closed   – due date passed and the student completed at least 50% of the questions
 * past_due – due date passed and the student completed less than 50%
 */
export function assignmentStatus(input: AssignmentStatusInput): AssignmentStatusKey {
  const pastDue = Boolean(input.dueAt && new Date(input.dueAt).getTime() < Date.now());
  if (!pastDue) return "active";
  const ratio = input.questionCount > 0 ? input.answeredCount / input.questionCount : 0;
  return ratio >= 0.5 ? "closed" : "past_due";
}

export const statusLabels: Record<AssignmentStatusKey, string> = {
  active: "Active",
  closed: "Closed",
  past_due: "Past due",
};

export const statusBadgeVariant: Record<AssignmentStatusKey, "default" | "secondary" | "destructive"> = {
  active: "default",
  closed: "secondary",
  past_due: "destructive",
};
