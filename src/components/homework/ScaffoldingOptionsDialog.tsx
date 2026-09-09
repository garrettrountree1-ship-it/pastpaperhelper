import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getClassScaffolding,
  setAssignmentScaffolding,
  setClassScaffolding,
  setStudentScaffolding,
} from "@/lib/scaffolding.functions";

const INHERIT = "__inherit__";

type Row = {
  allowHint: boolean | null;
  allowSteps: boolean | null;
  maxAttempts: number | null;
  examMode: boolean | null;
  maxPaperSubmissions: number | null;
};
type AssignmentRow = Row & { id: string; title: string };
type StudentRow = { id: string; name: string };
type OverrideRow = Row & { assignmentId: string; studentId: string };
const ATTEMPT_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10];

function attemptLabel(value: number) {
  return value === 0 ? "Unlimited tries" : `${value} ${value === 1 ? "try" : "tries"}`;
}

const SUBMISSION_CHOICES = [1, 2, 3, 4, 5];

function submissionLabel(value: number) {
  return value === 0 ? "Unlimited hand-ins" : `${value} hand-in${value === 1 ? "" : "s"}`;
}

/** How many times the whole paper may be handed in. */
function SubmissionsSelect({
  value,
  inheritLabel,
  onChange,
}: {
  value: number | null;
  inheritLabel: string | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <Select
      value={value === null ? INHERIT : String(value)}
      onValueChange={(next) => onChange(next === INHERIT ? null : Number(next))}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {inheritLabel ? <SelectItem value={INHERIT}>{inheritLabel}</SelectItem> : null}
        <SelectItem value="0">Unlimited hand-ins</SelectItem>
        {SUBMISSION_CHOICES.map((count) => (
          <SelectItem key={count} value={String(count)}>
            {submissionLabel(count)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** On / Off / follow-the-level-above picker. */
function OnOffSelect({
  value,
  inheritLabel,
  onChange,
}: {
  value: boolean | null;
  inheritLabel: string;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <Select
      value={value === null ? INHERIT : value ? "on" : "off"}
      onValueChange={(next) => onChange(next === INHERIT ? null : next === "on")}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={INHERIT}>{inheritLabel}</SelectItem>
        <SelectItem value="on">On</SelectItem>
        <SelectItem value="off">Off</SelectItem>
      </SelectContent>
    </Select>
  );
}

function AttemptsSelect({
  value,
  inheritLabel,
  onChange,
}: {
  value: number | null;
  inheritLabel: string | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <Select
      value={value === null ? INHERIT : String(value)}
      onValueChange={(next) => onChange(next === INHERIT ? null : Number(next))}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {inheritLabel ? <SelectItem value={INHERIT}>{inheritLabel}</SelectItem> : null}
        <SelectItem value="0">Unlimited tries</SelectItem>
        {ATTEMPT_CHOICES.map((count) => (
          <SelectItem key={count} value={String(count)}>
            {attemptLabel(count)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ScaffoldingOptionsDialog({ classId }: { classId: string }) {
  const [open, setOpen] = useState(false);
  const [openAssignment, setOpenAssignment] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const queryKey = ["scaffolding", classId];

  const settings = useQuery({
    queryKey,
    queryFn: () => getClassScaffolding({ data: { classId } }),
    enabled: open,
  });

  const saveClass = useServerFn(setClassScaffolding);
  const saveAssignment = useServerFn(setAssignmentScaffolding);
  const saveStudent = useServerFn(setStudentScaffolding);

  const done = () => {
    toast.success("Scaffolding saved");
    queryClient.invalidateQueries({ queryKey });
  };
  const fail = (error: Error) => toast.error(error.message);

  const classMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      saveClass({ data: { classId, ...input } as never }),
    onSuccess: done,
    onError: fail,
  });
  const assignmentMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => saveAssignment({ data: input as never }),
    onSuccess: done,
    onError: fail,
  });
  const studentMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => saveStudent({ data: input as never }),
    onSuccess: done,
    onError: fail,
  });

  const data = settings.data;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="mr-2 size-4" />
          Scaffolding options
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scaffolding options</DialogTitle>
        </DialogHeader>

        {settings.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : settings.isError ? (
          <p className="text-sm text-muted-foreground">{(settings.error as Error).message}</p>
        ) : data ? (
          <div className="space-y-6">
            <section className="rounded-lg border border-border p-4">
              <h3 className="font-display text-lg">All homework (class default)</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Step-by-step breakdown</Label>
                  <Select
                    value={data.klass.allowSteps ? "on" : "off"}
                    onValueChange={(value) =>
                      classMutation.mutate({ allowSteps: value === "on" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on">On</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Give me a hint</Label>
                  <Select
                    value={data.klass.allowHint ? "on" : "off"}
                    onValueChange={(value) => classMutation.mutate({ allowHint: value === "on" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on">On</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tries per question</Label>
                  <AttemptsSelect
                    value={data.klass.maxAttempts}
                    inheritLabel={null}
                    onChange={(value) => classMutation.mutate({ maxAttempts: value ?? 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Take it like a real paper</Label>
                  <Select
                    value={data.klass.examMode ? "on" : "off"}
                    onValueChange={(value) => classMutation.mutate({ examMode: value === "on" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on">On</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hand-ins per paper</Label>
                  <SubmissionsSelect
                    value={data.klass.maxPaperSubmissions}
                    inheritLabel={null}
                    onChange={(value) =>
                      classMutation.mutate({ maxPaperSubmissions: value ?? 0 })
                    }
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Exam conditions: hints and step-by-step help are switched off.
              </p>
            </section>

            <section className="rounded-lg border border-border p-4">
              <h3 className="font-display text-lg">Each homework</h3>
              {data.assignments.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No homework yet.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {data.assignments.map((assignment: AssignmentRow) => {
                    const expanded = openAssignment === assignment.id;
                    const effective = {
                      allowSteps: assignment.allowSteps ?? data.klass.allowSteps,
                      allowHint: assignment.allowHint ?? data.klass.allowHint,
                      maxAttempts: assignment.maxAttempts ?? data.klass.maxAttempts,
                      examMode: assignment.examMode ?? data.klass.examMode,
                      maxPaperSubmissions:
                        assignment.maxPaperSubmissions ?? data.klass.maxPaperSubmissions,
                    };
                    return (
                      <div key={assignment.id} className="rounded-lg border border-border p-3">
                        <p className="truncate font-medium">{assignment.title}</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Step-by-step</Label>
                            <OnOffSelect
                              value={assignment.allowSteps}
                              inheritLabel={`Class default (${data.klass.allowSteps ? "on" : "off"})`}
                              onChange={(value) =>
                                assignmentMutation.mutate({
                                  assignmentId: assignment.id,
                                  allowSteps: value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Hint</Label>
                            <OnOffSelect
                              value={assignment.allowHint}
                              inheritLabel={`Class default (${data.klass.allowHint ? "on" : "off"})`}
                              onChange={(value) =>
                                assignmentMutation.mutate({
                                  assignmentId: assignment.id,
                                  allowHint: value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Tries</Label>
                            <AttemptsSelect
                              value={assignment.maxAttempts}
                              inheritLabel={`Class default (${attemptLabel(data.klass.maxAttempts)})`}
                              onChange={(value) =>
                                assignmentMutation.mutate({
                                  assignmentId: assignment.id,
                                  maxAttempts: value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Real paper</Label>
                            <OnOffSelect
                              value={assignment.examMode}
                              inheritLabel={`Class default (${data.klass.examMode ? "on" : "off"})`}
                              onChange={(value) =>
                                assignmentMutation.mutate({
                                  assignmentId: assignment.id,
                                  examMode: value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Hand-ins</Label>
                            <SubmissionsSelect
                              value={assignment.maxPaperSubmissions}
                              inheritLabel={`Class default (${submissionLabel(data.klass.maxPaperSubmissions)})`}
                              onChange={(value) =>
                                assignmentMutation.mutate({
                                  assignmentId: assignment.id,
                                  maxPaperSubmissions: value,
                                })
                              }
                            />
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 px-0"
                          onClick={() => setOpenAssignment(expanded ? null : assignment.id)}
                        >
                          {expanded ? "Hide individual students" : "Individual students"}
                        </Button>

                        {expanded ? (
                          data.students.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No students have joined yet.
                            </p>
                          ) : (
                            <div className="space-y-3 border-t pt-3">
                              {data.students.map((student: StudentRow) => {
                                const override = data.studentOverrides.find(
                                  (o: OverrideRow) =>
                                    o.assignmentId === assignment.id && o.studentId === student.id,
                                );
                                return (
                                  <div key={student.id} className="rounded-md bg-secondary/40 p-3">
                                    <p className="truncate text-sm font-medium">{student.name}</p>
                                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                                      <OnOffSelect
                                        value={override?.allowSteps ?? null}
                                        inheritLabel={`Step-by-step: same as homework (${effective.allowSteps ? "on" : "off"})`}
                                        onChange={(value) =>
                                          studentMutation.mutate({
                                            assignmentId: assignment.id,
                                            studentId: student.id,
                                            allowSteps: value,
                                          })
                                        }
                                      />
                                      <OnOffSelect
                                        value={override?.allowHint ?? null}
                                        inheritLabel={`Hint: same as homework (${effective.allowHint ? "on" : "off"})`}
                                        onChange={(value) =>
                                          studentMutation.mutate({
                                            assignmentId: assignment.id,
                                            studentId: student.id,
                                            allowHint: value,
                                          })
                                        }
                                      />
                                      <AttemptsSelect
                                        value={override?.maxAttempts ?? null}
                                        inheritLabel={`Tries: same as homework (${attemptLabel(effective.maxAttempts)})`}
                                        onChange={(value) =>
                                          studentMutation.mutate({
                                            assignmentId: assignment.id,
                                            studentId: student.id,
                                            maxAttempts: value,
                                          })
                                        }
                                      />
                                      <OnOffSelect
                                        value={override?.examMode ?? null}
                                        inheritLabel={`Real paper: same as homework (${effective.examMode ? "on" : "off"})`}
                                        onChange={(value) =>
                                          studentMutation.mutate({
                                            assignmentId: assignment.id,
                                            studentId: student.id,
                                            examMode: value,
                                          })
                                        }
                                      />
                                      <SubmissionsSelect
                                        value={override?.maxPaperSubmissions ?? null}
                                        inheritLabel={`Hand-ins: same as homework (${submissionLabel(effective.maxPaperSubmissions)})`}
                                        onChange={(value) =>
                                          studentMutation.mutate({
                                            assignmentId: assignment.id,
                                            studentId: student.id,
                                            maxPaperSubmissions: value,
                                          })
                                        }
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
