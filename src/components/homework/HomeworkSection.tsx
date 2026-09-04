import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageTeacherDialog } from "@/components/messaging/MessageTeacherDialog";
import {
  assignmentStatus,
  statusBadgeVariant,
  statusLabels,
  type AssignmentStatusKey,
} from "@/lib/assignment-status";
import { createClass, joinClass, listStudentWork, listTeacherClasses } from "@/lib/app.functions";
import { formatDueDate } from "@/lib/datetime";

/** Student homework list for one class. */
export function StudentClassHomework({ classId }: { classId: string }) {
  const work = useQuery({ queryKey: ["student-work"], queryFn: useServerFn(listStudentWork) });
  const [statusFilter, setStatusFilter] = useState<"all" | AssignmentStatusKey>("all");

  const classAssignments = (work.data?.assignments ?? []).filter((a) => a.classId === classId);
  const classes = (work.data?.classes ?? []).filter((klass) => klass.id === classId);

  return (
    <div className="space-y-6">
      <div className="paper flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h2 className="text-3xl">Your homework</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Answer each question, then work with the tutor on anything you get wrong.
          </p>
        </div>
      </div>

      {work.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : classes.length === 0 ? (
        <div className="paper p-8 text-center text-muted-foreground">
          This class isn&apos;t available to you.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "active", "closed", "past_due"] as const).map((key) => {
              const count = classAssignments.filter((a) =>
                key === "all" ? true : assignmentStatus(a) === key,
              ).length;
              return (
                <Button
                  key={key}
                  size="sm"
                  variant={statusFilter === key ? "default" : "outline"}
                  onClick={() => setStatusFilter(key)}
                >
                  {key === "all" ? "All" : statusLabels[key]} ({count})
                </Button>
              );
            })}
          </div>
          {classes.map((klass) => {

            const items = (work.data?.assignments ?? [])
              .filter((a) => a.classId === klass.id)
              .filter((a) => (statusFilter === "all" ? true : assignmentStatus(a) === statusFilter))
              .sort((a, b) => {
                const at = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
                const bt = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
                return at - bt;
              });
            return (
              <section key={klass.id} className="paper p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                  <h2 className="font-display text-2xl">{klass.name}</h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      {[klass.subject, klass.curriculum].filter(Boolean).join(" · ")} ·{" "}
                      {items.length} {items.length === 1 ? "assignment" : "assignments"}
                    </p>
                    <MessageTeacherDialog
                      classId={klass.id}
                      className={klass.name}
                      assignmentOptions={(work.data?.assignments ?? [])
                        .filter((a) => a.classId === klass.id)
                        .map((a) => ({ id: a.id, title: a.title }))}
                    />
                  </div>
                </div>

                {items.length === 0 ? (
                  <p className="pt-4 text-sm text-muted-foreground">
                    No homework set for this class yet.
                  </p>
                ) : (
                  <div className="divide-y">
                    {items.map((assignment) => (
                      <Link
                        key={assignment.id}
                        to="/assignments/$assignmentId"
                        params={{ assignmentId: assignment.id }}
                        className="flex flex-wrap items-center justify-between gap-4 py-4 transition-colors hover:text-primary"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg">{assignment.title}</h3>
                            <Badge variant={statusBadgeVariant[assignmentStatus(assignment)]}>
                              {statusLabels[assignmentStatus(assignment)]}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {assignment.questionCount} questions · {assignment.totalMarks} marks
                            {assignment.dueAt ? ` · due ${formatDueDate(assignment.dueAt)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {assignment.awardedMarks !== null && assignment.status !== "not_started" ? (
                            <span className="font-display text-lg">
                              {assignment.awardedMarks}/{assignment.totalMarks}
                            </span>
                          ) : null}
                          <Badge variant={assignment.status === "submitted" ? "default" : "secondary"}>
                            {assignment.status === "submitted"
                              ? "Submitted"
                              : assignment.status === "in_progress"
                                ? "In progress"
                                : "Not started"}
                          </Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

