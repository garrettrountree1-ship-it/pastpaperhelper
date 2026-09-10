import { DateTime24Input } from "@/components/assignments/DateTime24Input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAssignmentAccessControls,
  setAssignmentAccess,
  setStudentAssignmentAccess,
} from "@/lib/app.functions";
import { formatDueDate, fromLocalInput, toLocalInput } from "@/lib/datetime";

/**
 * Teacher control panel for an assignment's due date (class-wide or per student)
 * and for releasing the mark scheme to the class or to individual students.
 */
export function AccessControlsDialog({
  classId,
  assignmentId,
  trigger,
}: {
  classId: string;
  assignmentId: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [classDue, setClassDue] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const load = useServerFn(getAssignmentAccessControls);
  const saveClass = useServerFn(setAssignmentAccess);
  const saveStudent = useServerFn(setStudentAssignmentAccess);

  const controls = useQuery({
    queryKey: ["access-controls", assignmentId],
    queryFn: () => load({ data: { assignmentId } }),
    enabled: open,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["access-controls", assignmentId] });
    queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });
    queryClient.invalidateQueries({ queryKey: ["overview", classId] });
  }

  const classMutation = useMutation({
    mutationFn: (input: {
      dueAt?: string | null;
      markSchemeRevealed?: boolean;
      revealOnFullMarks?: boolean;
    }) =>
      saveClass({ data: { assignmentId, ...input } }),
    onSuccess: () => {
      toast.success("Saved for the whole class");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const studentMutation = useMutation({
    mutationFn: (input: {
      studentId: string;
      dueAt?: string | null;
      markSchemeRevealed?: boolean;
      revealOnFullMarks?: boolean;
    }) => saveStudent({ data: { assignmentId, ...input } }),
    onSuccess: () => {
      toast.success("Saved for that student");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = controls.data;
  const classDueValue = classDue ?? toLocalInput(data?.dueAt ?? null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setClassDue(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Due Date &amp; Answer Release</DialogTitle>
        </DialogHeader>

        {controls.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : controls.isError ? (
          <p className="text-sm text-muted-foreground">
            {(controls.error as Error).message}
          </p>
        ) : data ? (
          <div className="space-y-6">
            <section className="rounded-lg border border-border p-4">
              <h3 className="font-medium">Whole class</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                When the due date and time is reached the homework locks automatically. Only you can
                extend it.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="class-due">Due date &amp; time (24h)</Label>
                  <DateTime24Input
                    id="class-due"
                    className="mt-1"
                    value={classDueValue}
                    onChange={setClassDue}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={classMutation.isPending}
                  onClick={() =>
                    classMutation.mutate({ dueAt: fromLocalInput(classDueValue) })
                  }
                >
                  Save due date
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={classMutation.isPending || !data.dueAt}
                  onClick={() => {
                    setClassDue("");
                    classMutation.mutate({ dueAt: null });
                  }}
                >
                  Remove due date
                </Button>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Checkbox
                  id="class-reveal"
                  checked={data.markSchemeRevealed}
                  onCheckedChange={(checked) =>
                    classMutation.mutate({ markSchemeRevealed: checked === true })
                  }
                />
                <Label htmlFor="class-reveal" className="text-sm font-normal">
                  Reveal the mark scheme answers to the whole class
                </Label>
              </div>
              <div className="mt-3 flex items-start gap-2">
                <Checkbox
                  id="class-full-marks"
                  className="mt-0.5"
                  checked={data.revealOnFullMarks}
                  onCheckedChange={(checked) =>
                    classMutation.mutate({ revealOnFullMarks: checked === true })
                  }
                />
                <div>
                  <Label htmlFor="class-full-marks" className="text-sm font-normal">
                    Show the mark scheme for a question as soon as a student gets full marks on it
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The answer picture appears in a box under that question only — the rest of the
                    homework stays hidden until you release it.
                  </p>
                </div>
              </div>
            </section>


            <section className="rounded-lg border border-border p-4">
              <h3 className="font-medium">Individual students</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Give one student extra time or release the mark scheme to them only. A student due
                date replaces the class due date.
              </p>
              {data.students.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No students have joined yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {data.students.map((student) => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      classDueAt={data.dueAt}
                      classRevealed={data.markSchemeRevealed}
                      classFullMarks={data.revealOnFullMarks}
                      saving={studentMutation.isPending}
                      onSave={(input) => studentMutation.mutate({ studentId: student.id, ...input })}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StudentRow({
  student,
  classDueAt,
  classRevealed,
  classFullMarks,
  saving,
  onSave,
}: {
  student: {
    id: string;
    name: string;
    dueAt: string | null;
    markSchemeRevealed: boolean | null;
    revealOnFullMarks: boolean | null;
  };
  classDueAt: string | null;
  classRevealed: boolean;
  classFullMarks: boolean;
  saving: boolean;
  onSave: (input: {
    dueAt?: string | null;
    markSchemeRevealed?: boolean;
    revealOnFullMarks?: boolean;
  }) => void;
}) {
  const [due, setDue] = useState<string | null>(null);
  const value = due ?? toLocalInput(student.dueAt);
  const effective = student.dueAt ?? classDueAt;

  return (
    <div className="rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{student.name}</p>
        <Badge variant="secondary">Due: {formatDueDate(effective)}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <DateTime24Input value={value} onChange={setDue} />
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => onSave({ dueAt: fromLocalInput(value) })}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={saving || !student.dueAt}
          onClick={() => {
            setDue("");
            onSave({ dueAt: null });
          }}
        >
          Use class due date
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Checkbox
          id={`reveal-${student.id}`}
          checked={student.markSchemeRevealed ?? classRevealed}
          disabled={saving}
          onCheckedChange={(checked) => onSave({ markSchemeRevealed: checked === true })}
        />
        <Label htmlFor={`reveal-${student.id}`} className="text-sm font-normal">
          Reveal the mark scheme to this student
        </Label>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Checkbox
          id={`full-marks-${student.id}`}
          checked={student.revealOnFullMarks ?? classFullMarks}
          disabled={saving}
          onCheckedChange={(checked) => onSave({ revealOnFullMarks: checked === true })}
        />
        <Label htmlFor={`full-marks-${student.id}`} className="text-sm font-normal">
          Show the mark scheme for a question as soon as this student gets full marks on it
        </Label>
      </div>
    </div>
  );
}
