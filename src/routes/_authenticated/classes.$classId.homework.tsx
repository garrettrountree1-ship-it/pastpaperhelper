import { DateTime24Input } from "@/components/assignments/DateTime24Input";
import { RejectReasonDialog } from "@/components/homework/RejectReasonDialog";
import { StudentNotifiedDialog } from "@/components/homework/StudentNotifiedDialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  statusBadgeVariant,
  statusLabels,
  type AssignmentStatusKey,
} from "@/lib/assignment-status";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RefreshCw,
  ListChecks,
  CalendarClock,
  Settings,
  Trash2,
  Unlock,
  Wand2,
  ShieldAlert,
  Languages,
  Archive,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { SectionShell, SectionTabsMobile } from "@/components/SectionShell";
import { StudentClassHomework } from "@/components/homework/HomeworkSection";
import { LanguageSettingsDialog } from "@/components/assignments/LanguageSettingsDialog";
import { AccessControlsDialog } from "@/components/assignments/AccessControlsDialog";
import { TutorSettingsDialog } from "@/components/assignments/TutorSettingsDialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { downloadXlsx } from "@/lib/xlsx-export";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDueDate, fromLocalInput, toLocalInput } from "@/lib/datetime";
import {
  bulkGradeQuestion,
  createAssignment,
  creditQuestionForAll,
  deleteAssignment,
  setAssignmentArchived,
  deleteClass,
  removeStudentFromClass,

  deleteQuestion,
  getAssignmentQuestionControls,
  setQuestionPhotoMode,
  setQuestionProtection,
  setQuestionExclusion,
  extractPaperQuestions,
  getAssignmentForEdit,
  getClassOverview,
  getMe,
  getStudentClassReport,
  setGradebookDetail,
  updateAssignment,
  unlockSubmission,
  updateClass,
} from "@/lib/app.functions";
import { addDemoStudents } from "@/lib/demo.functions";
import { filesToPages } from "@/lib/pdf-pages";
import { PhotoModeControl } from "@/components/assignments/PhotoModeControl";
import type { PhotoMode } from "@/lib/photo-mode";
import { questionBody, questionLabel } from "@/lib/question-label";

export const Route = createFileRoute("/_authenticated/classes/$classId/homework")({
  head: () => ({
    meta: [
      { title: "Class · PastPaperHelper.AI" },
      { name: "description", content: "Class assignments, students and homework grades." },
      { property: "og:title", content: "Class · PastPaperHelper.AI" },
      { property: "og:description", content: "Class assignments, students and homework grades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClassPage,
  pendingComponent: PendingClassPage,
  errorComponent: ErrorClassPage,
  notFoundComponent: () => <div className="p-8 text-center">Class not found.</div>,
});

type QuestionDraft = {
  id: string | null;
  questionText: string;
  markScheme: string;
  marks: number;
  imagePaths: string[];
  imageUrls: string[];
};

const emptyQuestion = (): QuestionDraft => ({
  id: null,
  questionText: "",
  markScheme: "",
  marks: 1,
  imagePaths: [],
  imageUrls: [],
});

function PendingClassPage() {
  const { classId } = Route.useParams();
  return (
    <SectionShell classId={classId} current="homework" title="Homework">
      {() => <Skeleton className="h-64 w-full" />}
    </SectionShell>
  );
}

function ErrorClassPage({ error, reset }: { error: Error; reset: () => void }) {
  const { classId } = Route.useParams();
  return (
    <SectionShell classId={classId} current="homework" title="Homework">
      {() => (
        <div className="text-center">
          <p className="mb-4 text-muted-foreground">
            We couldn&apos;t load this class. {error.message}
          </p>
          <Button onClick={reset}>Try again</Button>
        </div>
      )}
    </SectionShell>
  );
}

function ClassPage() {
  const { classId } = Route.useParams();
  return (
    <SectionShell classId={classId} current="homework" title="Homework">
      {(role) => (
        <>
          <SectionTabsMobile classId={classId} current="homework" />
          {role === "student" ? (
            <StudentClassHomework classId={classId} />
          ) : (
            <ClassPageContent classId={classId} />
          )}
        </>
      )}
    </SectionShell>
  );
}

function ClassPageContent({ classId }: { classId: string }) {
  const overview = useQuery({
    queryKey: ["class-overview", classId],
    queryFn: () => getClassOverview({ data: { classId } }),
    retry: 2,
  });

  const setDetail = useServerFn(setGradebookDetail);
  const detailMutation = useMutation({
    mutationFn: (input: { studentId?: string; enabled: boolean | null }) =>
      setDetail({ data: { classId, ...input } }),
    onSuccess: () => overview.refetch(),
    onError: (error: Error) => toast.error(error.message),
  });

  if (overview.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (overview.isError) {
    return (
      <div className="text-center">
        <p className="mb-4 text-muted-foreground">
          We couldn&apos;t load this class. {(overview.error as Error).message}
        </p>
        <Button onClick={() => overview.refetch()}>Retry</Button>
      </div>
    );
  }
  if (!overview.data) return null;

  const data = overview.data;

  return (
    <div className="paper p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {data.klass.curriculum} · {data.klass.subject} · join code{" "}
            <span className="font-mono highlight-underline">{data.klass.join_code}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AiWarningLimitDialog
            classId={classId}
            klass={data.klass}
            onSaved={() => overview.refetch()}
          />
          <TutorSettingsDialog classId={classId} />
          <ClassSettingsDialog
            classId={classId}
            klass={data.klass}
            onSaved={() => overview.refetch()}
          />
          <AssignmentDialog classId={classId} trigger={<Button>New assignment</Button>} />
        </div>
      </div>

      <Tabs defaultValue="assignments" className="mt-6">
        <TabsList>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="gradebook">Gradebook</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="mt-4 space-y-3">
          <AssignmentList
            classId={classId}
            assignments={data.assignments}
            studentCount={data.students.length}
          />
        </TabsContent>

        <TabsContent value="gradebook" className="mt-4">
          <DemoStudentSeeder classId={classId} onSeeded={() => overview.refetch()} />

          {data.students.length === 0 ? (
            <div className="paper p-8 text-center text-muted-foreground">
              No students have joined yet.
            </div>
          ) : (
            <div className="paper overflow-x-auto p-2">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="gradebook-detail"
                    checked={data.klass.gradebook_detail !== false}
                    onCheckedChange={(checked) => detailMutation.mutate({ enabled: checked })}
                  />
                  <Label htmlFor="gradebook-detail" className="text-sm">
                    Detailed reports (time on task, tutor chats, every attempt)
                  </Label>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadGradebook(data.klass.name, data.assignments, data.students)
                  }
                >
                  <Download className="size-4" /> Download .xlsx
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Student</TableHead>
                    {data.assignments.map((assignment) => (
                      <TableHead key={assignment.id}>
                        <div className="flex items-center gap-1">
                          <span>{assignment.title}</span>
                          <QuestionEditorDialog
                            classId={classId}
                            assignmentId={assignment.id}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                title="Question editor"
                              >
                                <ListChecks className="size-4" />
                              </Button>
                            }
                          />
                          <AccessControlsDialog
                            classId={classId}
                            assignmentId={assignment.id}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                title="Due date & answer release"
                              >
                                <CalendarClock className="size-4" />
                              </Button>
                            }
                          />
                        </div>
                      </TableHead>
                    ))}
                    <TableHead>Average</TableHead>
                    <TableHead className="whitespace-nowrap">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.students.map((student) => (
                    <GradebookRow
                      key={student.id}
                      classId={classId}
                      student={student}
                      titles={Object.fromEntries(
                        data.assignments.map((a) => [a.id, a.title] as const),
                      )}
                      columns={data.assignments.length + 4}
                      onToggleDetail={(enabled) =>
                        detailMutation.mutate({ studentId: student.id, enabled })
                      }
                      onChanged={() => overview.refetch()}
                    />

                  ))}
                </TableBody>
              </Table>
              <p className="p-3 text-xs text-muted-foreground">
                Scores update live as students work. * still in progress; scores freeze at the due
                date.

                Click a score to review answers and adjust marks. Turn detail on — for the class
                above or per student in the last column — to see time spent, tutor questions and
                every attempt.
              </p>
            </div>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}

type TeacherAssignment = {
  id: string;
  title: string;
  questionCount: number;
  totalMarks: number;
  dueAt: string | null;
  submittedCount: number;
  pastDue: boolean;
  behindCount: number;
  archivedAt?: string | null;
};

function AssignmentList({
  classId,
  assignments,
  studentCount,
}: {
  classId: string;
  assignments: TeacherAssignment[];
  studentCount: number;
}) {
  const [filter, setFilter] = useState<"all" | AssignmentStatusKey>("all");
  const [sort, setSort] = useState<"due" | "title">("due");

  const archivedList = assignments.filter((a) => Boolean(a.archivedAt));
  const active = assignments.filter((a) => !a.archivedAt);

  const tagged = active.map((a) => {
    const behindAll = studentCount > 0 && a.behindCount >= studentCount;
    const key: AssignmentStatusKey = !a.pastDue ? "active" : behindAll ? "past_due" : "closed";
    return { ...a, statusKey: key };
  });


  const counts = {
    all: tagged.length,
    active: tagged.filter((a) => a.statusKey === "active").length,
    closed: tagged.filter((a) => a.statusKey === "closed").length,
    past_due: tagged.filter((a) => a.statusKey === "past_due").length,
  };

  const visible = tagged
    .filter((a) => (filter === "all" ? true : a.statusKey === filter))
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      const at = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });

  if (assignments.length === 0) {
    return (
      <div className="paper p-8 text-center text-muted-foreground">
        No assignments yet. Add past-paper questions with their mark schemes.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "active", "closed", "past_due"] as const).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={filter === key ? "default" : "outline"}
              onClick={() => setFilter(key)}
            >
              {key === "all" ? "All" : statusLabels[key]} ({counts[key]})
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ArchivedAssignmentsDialog classId={classId} assignments={archivedList} />
          <span className="text-sm text-muted-foreground">Sort by</span>
          <Select value={sort} onValueChange={(v) => setSort(v as "due" | "title")}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due">Due date</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Lock className="size-4" />
          Exam-integrity protections are always on for homework
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Screen capture, snipping tools, copying question text and pasting into answer or tutor
          boxes are all fully blocked. A student using a second phone to photograph the screen
          cannot be prevented by any website.
        </p>
      </div>


      {visible.length === 0 ? (
        <div className="paper p-8 text-center text-muted-foreground">
          No {filter === "all" ? "" : `${statusLabels[filter].toLowerCase()} `}assignments to show.
        </div>
      ) : (
        visible.map((assignment) => (
          <div
            key={assignment.id}
            className="paper flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl">{assignment.title}</h2>
                <Badge variant={statusBadgeVariant[assignment.statusKey]}>
                  {statusLabels[assignment.statusKey]}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {assignment.questionCount} questions · {assignment.totalMarks} marks
                {assignment.dueAt ? ` · due ${formatDueDate(assignment.dueAt)}` : ""}
                {assignment.pastDue && assignment.behindCount > 0
                  ? ` · ${assignment.behindCount} student${assignment.behindCount === 1 ? "" : "s"} under 50%`
                  : ""}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{assignment.submittedCount} submitted</Badge>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to="/assignments/$assignmentId/preview"
                    params={{ assignmentId: assignment.id }}
                  >
                    <Eye className="size-4" />
                    Student view
                  </Link>
                </Button>
                <QuestionEditorDialog
                  classId={classId}
                  assignmentId={assignment.id}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Pencil className="size-4" />
                      Question editor
                    </Button>
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AccessControlsDialog
                  classId={classId}
                  assignmentId={assignment.id}
                  trigger={
                    <Button variant="outline" size="sm">
                      <CalendarClock className="size-4" />
                      Due Date &amp; Answer Release
                    </Button>
                  }
                />
                <CopyProtectionDialog
                  classId={classId}
                  assignmentId={assignment.id}
                  protectQuestions={Boolean(
                    (assignment as { protectQuestions?: boolean }).protectQuestions,
                  )}
                />
                <LanguageSettingsDialog
                  classId={classId}
                  assignmentId={assignment.id}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Languages className="size-4" />
                      HW Language Settings
                    </Button>
                  }
                />
                <ArchiveAssignmentButton
                  classId={classId}
                  assignmentId={assignment.id}
                  title={assignment.title}
                />
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Per-assignment copy protection. Optional for the teacher: selecting and
 * copying the question wording can be blocked for this homework only. Pasting
 * into answers and the tutor chat is always blocked and cannot be turned on.
 */
function CopyProtectionDialog({
  classId,
  assignmentId,
  protectQuestions,
}: {
  classId: string;
  assignmentId: string;
  protectQuestions: boolean;
}) {
  const queryClient = useQueryClient();
  const setProtection = useServerFn(setQuestionProtection);
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      setProtection({ data: { assignmentId, protectQuestions: next } }),
    onSuccess: (_data, next) => {
      toast.success(
        next
          ? "Copying of these questions is now blocked"
          : "Students can copy these questions again",
      );
      queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });
      queryClient.invalidateQueries({ queryKey: ["assignment-for-edit", assignmentId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={protectQuestions ? "default" : "outline"} size="sm">
          {protectQuestions ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          {protectQuestions ? "Copying blocked" : "Copying allowed"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Screenshot, copy &amp; paste protection</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-secondary/30 p-4">
            <div className="space-y-1">
              <Label htmlFor={`protect-${assignmentId}`}>Block copying of the questions</Label>
              <p className="text-sm text-muted-foreground">
                Optional. When on, students can read the questions but cannot select, copy or
                right-click the wording of this homework.
              </p>
              <p className="text-sm font-medium">
                Currently {protectQuestions ? "ON — copying is blocked" : "OFF — copying is allowed"}
              </p>
            </div>
            <Switch
              id={`protect-${assignmentId}`}
              checked={protectQuestions}
              disabled={mutation.isPending}
              onCheckedChange={(checked) => mutation.mutate(checked === true)}
            />
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium">
              Always on, on every homework — what it actually does
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                Pasting into an answer box or the tutor chat is fully blocked, flagged and rejected.
              </li>
              <li>
                Screenshot, snipping-tool and print keyboard shortcuts are intercepted while the
                homework page has focus, and the questions blur for a moment afterwards.
              </li>
              <li>
                The questions blur whenever the tab or window loses focus, so a snipping tool or
                screen-share opened over the page captures a blurred page.
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Honest limit: screenshots are taken by the operating system, not the web page, so no
              website can block Print Screen from the Start menu, a phone photo of the screen, or a
              recording app. This is a strong deterrent, not a guarantee — for a hard block you need
              a locked-down exam browser or supervised devices. Only copying of the question wording
              (above) is optional.
            </p>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}





function AssignmentDialog({
  classId,
  assignmentId,
  trigger,
  asPanel,
}: {
  classId: string;
  assignmentId?: string;
  trigger?: React.ReactNode;
  asPanel?: boolean;
}) {
  const queryClient = useQueryClient();
  const create = useServerFn(createAssignment);
  const update = useServerFn(updateAssignment);
  const extract = useServerFn(extractPaperQuestions);
  const loadForEdit = useServerFn(getAssignmentForEdit);
  const [open, setOpen] = useState(Boolean(asPanel));
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [paperFiles, setPaperFiles] = useState<File[]>([]);
  const [schemeFiles, setSchemeFiles] = useState<File[]>([]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [protectQuestions, setProtectQuestions] = useState(false);

  const editing = Boolean(assignmentId);

  const existing = useQuery({
    queryKey: ["assignment-edit", assignmentId],
    queryFn: () => loadForEdit({ data: { assignmentId: assignmentId! } }),
    enabled: open && editing,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });

  // Fill the form from the saved assignment exactly once per open, so a
  // background refetch never overwrites what the teacher is typing.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!open) hydrated.current = false;
  }, [open]);

  useEffect(() => {
    if (!open || !editing || !existing.data || hydrated.current) return;
    hydrated.current = true;
    setTitle(existing.data.title);
    setSubject(existing.data.subject);
    setInstructions(existing.data.instructions);
    setDueAt(toLocalInput(existing.data.dueAt));
    setProtectQuestions(Boolean(existing.data.protectQuestions));
    setQuestions(
      existing.data.questions.length > 0
        ? existing.data.questions.map((q) => ({
            ...q,
            imagePaths: q.imagePaths ?? [],
            imageUrls: q.imageUrls ?? [],
          }))
        : [emptyQuestion()],
    );
  }, [open, editing, existing.data]);

  const loadingExisting = editing && !hydrated.current;

  const extractMutation = useMutation({
    mutationFn: async () => {
      const [paper, scheme] = await Promise.all([
        filesToPages(paperFiles),
        filesToPages(schemeFiles),
      ]);
      return extract({
        data: { classId, subject, paperFiles: paper, markSchemeFiles: scheme },
      });
    },
    onSuccess: (result) => {
      setQuestions(
        result.questions.map((q) => ({
          ...q,
          id: null,
          imagePaths: q.imagePaths ?? [],
          imageUrls: q.imageUrls ?? [],
        })),
      );
      toast.success(`${result.questions.length} questions read from your files`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payloadQuestions = questions.map((q) => ({
        id: q.id ?? null,
        questionText: q.questionText.trim(),
        markScheme: q.markScheme.trim(),
        marks: q.marks,
        imagePaths: q.imagePaths ?? [],
      }));
      if (editing) {
        return update({
          data: {
            assignmentId: assignmentId!,
            title,
            subject,
            instructions,
            dueAt: fromLocalInput(dueAt),
            protectQuestions,
            questions: payloadQuestions,
          },
        });
      }
      return create({
        data: {
          classId,
          title,
          subject,
          instructions,
          dueAt: fromLocalInput(dueAt),
          protectQuestions,
          questions: payloadQuestions.map(({ id: _id, ...rest }) => rest),
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Assignment updated" : "Assignment set");
      if (!asPanel) setOpen(false);
      if (!editing) {
        setTitle("");
        setSubject("");
        setInstructions("");
        setDueAt("");
        setProtectQuestions(false);
        setPaperFiles([]);
        setSchemeFiles([]);
        setQuestions([emptyQuestion()]);
      }
      queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });
      if (assignmentId) {
        queryClient.invalidateQueries({ queryKey: ["assignment-edit", assignmentId] });
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const valid =
    title.trim().length > 0 &&
    questions.length > 0 &&
    questions.every((q) => q.questionText.trim() && q.markScheme.trim() && q.marks > 0);

  function update_(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  const body = (
    <>


        {loadingExisting && !existing.isError ? (
          <Skeleton className="h-64 w-full" />
        ) : editing && existing.isError ? (
          <div className="py-6 text-center">
            <p className="mb-4 text-muted-foreground">
              We couldn&apos;t load this assignment. {(existing.error as Error).message}
            </p>
            <Button onClick={() => existing.refetch()}>Retry</Button>
          </div>
        ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Add text here"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject / topic (optional)</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Add text here"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions (optional)</Label>
              <Input
                id="instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due">Due date (optional, 24h clock)</Label>
              <DateTime24Input id="due" value={dueAt} onChange={setDueAt} />
            </div>

          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-secondary/30 p-4">
            <div className="space-y-1">
              <Label htmlFor="protect-questions">
                Block copying of the questions (optional)
              </Label>
              <p className="text-sm text-muted-foreground">
                When on, students can read the questions but cannot select, copy or right-click the
                wording of this homework.
              </p>
              <p className="text-sm font-medium">
                Always on and not switchable: pasting into an answer box or the tutor chat is fully
                blocked; screenshot, snipping-tool and print shortcuts are intercepted and the
                questions blur whenever the tab loses focus. Screenshots taken by the operating
                system itself (or a phone camera) can&apos;t be stopped by any website, so this is a
                strong deterrent rather than a guarantee.
              </p>



            </div>
            <Switch
              id="protect-questions"
              checked={protectQuestions}
              onCheckedChange={setProtectQuestions}
            />
          </div>

          <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-4">
            <h3 className="font-display text-lg">Upload past paper &amp; mark scheme</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              PDF, Word (.docx) or photos. Combined in one file, or paper and mark scheme
              separately. The questions below are taken straight from the file you upload — every
              part (1a, 1b(i), 1b(ii)…) is transcribed and matched to its marking points, and you
              can edit anything before saving. Nothing is invented — every figure, diagram, graph
              and equation stays as the original page image attached to the question, so students
              see exactly what was printed rather than a description.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="paper-files">Past paper (or combined file)</Label>
                <Input
                  id="paper-files"
                  type="file"
                  accept="application/pdf,.pdf,.docx,.doc,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,image/*"
                  multiple
                  onChange={(event) => setPaperFiles(Array.from(event.target.files ?? []))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheme-files">Mark scheme (optional if combined)</Label>
                <Input
                  id="scheme-files"
                  type="file"
                  accept="application/pdf,.pdf,.docx,.doc,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,image/*"
                  multiple
                  onChange={(event) => setSchemeFiles(Array.from(event.target.files ?? []))}
                />
              </div>
            </div>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => extractMutation.mutate()}
              disabled={paperFiles.length === 0 || extractMutation.isPending}
            >
              <Wand2 className="size-4" />
              {extractMutation.isPending
                ? "Reading your uploaded paper..."
                : "Extract questions from uploaded paper"}
            </Button>
            {editing ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Extracting replaces the questions below.
              </p>
            ) : null}
          </div>


          <div className="space-y-4">
            {questions.map((question, index) => (
              <div key={question.id ?? `new-${index}`} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg">
                    Question {questionLabel(question.questionText, index)}
                  </h3>
                  {questions.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setQuestions((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="mt-3 space-y-3">
                  {question.imageUrls.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Original paper page shown to students (figures, diagrams and equations
                        exactly as printed)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {question.imageUrls.map((url, imageIndex) => (
                          <div key={url} className="relative">
                            <a href={url} target="_blank" rel="noreferrer">
                              <img
                                src={url}
                                alt={`Original paper page for question ${index + 1}`}
                                className="h-40 rounded-lg border border-border bg-card object-contain"
                              />
                            </a>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute right-1 top-1 bg-card/90"
                              onClick={() =>
                                update_(index, {
                                  imageUrls: question.imageUrls.filter((_, i) => i !== imageIndex),
                                  imagePaths: question.imagePaths.filter(
                                    (_, i) => i !== imageIndex,
                                  ),
                                })
                              }
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <Textarea
                    value={question.questionText}
                    onChange={(event) => update_(index, { questionText: event.target.value })}
                    placeholder="Paste the past-paper question here"
                    rows={3}
                  />
                  <Textarea
                    value={question.markScheme}
                    onChange={(event) => update_(index, { markScheme: event.target.value })}
                    placeholder="Paste the mark scheme answer here (students never see this)"
                    rows={3}
                  />
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`marks-${index}`}>Marks</Label>
                    <Input
                      id={`marks-${index}`}
                      type="number"
                      min={1}
                      value={question.marks}
                      onChange={(event) =>
                        update_(index, { marks: Math.max(1, Number(event.target.value) || 1) })
                      }
                      className="w-20"
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                setQuestions((prev) => [...prev, emptyQuestion()])
              }
            >
              <Plus className="size-4" />
              Add question
            </Button>
          </div>
        </div>
      )}
      {asPanel ? (
        <div className="mt-4 flex justify-end">
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Saving..." : editing ? "Save changes" : "Set homework"}
          </Button>
        </div>
      ) : null}
    </>
  );

  if (asPanel) return body;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit past-paper homework" : "Set past-paper homework"}
          </DialogTitle>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Saving..." : editing ? "Save changes" : "Set homework"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionControlsDialog({
  classId,
  assignmentId,
  trigger,
  asPanel,
}: {
  classId: string;
  assignmentId: string;
  trigger?: React.ReactNode;
  asPanel?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(asPanel));
  const [expanded, setExpanded] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const load = useServerFn(getAssignmentQuestionControls);
  const credit = useServerFn(creditQuestionForAll);
  const remove = useServerFn(deleteQuestion);
  const exclude = useServerFn(setQuestionExclusion);
  const savePhotoMode = useServerFn(setQuestionPhotoMode);



  const questionPhotoMode = useMutation({
    mutationFn: (vars: { questionId: string; photoMode: PhotoMode }) =>
      savePhotoMode({ data: vars }),
    onSuccess: () => {
      toast.success("Photo answer setting saved");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const controls = useQuery({
    queryKey: ["question-controls", assignmentId],
    queryFn: () => load({ data: { assignmentId } }),
    enabled: open,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["question-controls", assignmentId] });
    queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });
  }

  const creditAll = useMutation({
    mutationFn: (questionId: string) => credit({ data: { questionId } }),
    onSuccess: (result) => {
      toast.success(`Full credit given to ${result.credited} student(s)`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteOne = useMutation({
    mutationFn: (questionId: string) => remove({ data: { questionId } }),
    onSuccess: () => {
      toast.success("Question deleted");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleExclusion = useMutation({
    mutationFn: (vars: { questionId: string; studentId: string; excluded: boolean }) =>
      exclude({ data: vars }),
    onSuccess: () => refresh(),
    onError: (error: Error) => toast.error(error.message),
  });

  const isExcluded = (questionId: string, studentId: string) =>
    (controls.data?.exclusions ?? []).some(
      (e) => e.questionId === questionId && e.studentId === studentId,
    );

  const body = (
    <>

        {controls.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : controls.error ? (
          <div className="space-y-3 text-sm">
            <p className="text-destructive">{(controls.error as Error).message}</p>
            <Button size="sm" onClick={() => controls.refetch()}>
              Retry
            </Button>
          </div>
        ) : controls.data ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              If a question is faulty you can give every student full marks for it, or delete it
              from the assignment. Unassigning is optional and only affects the student you pick —
              the question disappears for them and no longer counts toward their total.
            </p>

            {controls.data.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">This assignment has no questions.</p>
            ) : (
              controls.data.questions.map((question, index) => {
                const label = questionLabel(question.questionText, index);
                const excludedCount = (controls.data?.exclusions ?? []).filter(
                  (e) => e.questionId === question.id,
                ).length;
                return (
                  <div key={question.id} className="rounded-md border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          Question {label} · {question.marks} mark
                          {question.marks === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {questionBody(question.questionText)}
                        </p>
                        {excludedCount > 0 ? (
                          <Badge variant="secondary" className="mt-2">
                            Unassigned for {excludedCount} student
                            {excludedCount === 1 ? "" : "s"}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={creditAll.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Give every student full marks (${question.marks}) for question ${label}?`,
                              )
                            )
                              creditAll.mutate(question.id);
                          }}
                        >
                          Credit all students
                        </Button>
                        <Button

                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setExpanded((current) => (current === question.id ? null : question.id))
                          }
                        >
                          {expanded === question.id ? "Hide students" : "Unassign per student"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deleteOne.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete question ${label} and every student answer to it?`,
                              )
                            )
                              deleteOne.mutate(question.id);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-border pt-3">
                      <p className="text-xs text-muted-foreground">
                        Photo answers for this question
                      </p>
                      <div className="mt-1">
                        <PhotoModeControl
                          value={question.photoMode}
                          disabled={questionPhotoMode.isPending}
                          onChange={(next) =>
                            next
                              ? questionPhotoMode.mutate({
                                  questionId: question.id,
                                  photoMode: next,
                                })
                              : undefined
                          }
                        />
                      </div>
                    </div>




                    {expanded === question.id ? (
                      <div className="mt-4 space-y-2 border-t border-border pt-3">
                        {controls.data.students.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No students have joined this class yet.
                          </p>
                        ) : (
                          controls.data.students.map((student) => (
                            <label
                              key={student.id}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Checkbox
                                checked={isExcluded(question.id, student.id)}
                                disabled={toggleExclusion.isPending}
                                onCheckedChange={(checked) =>
                                  toggleExclusion.mutate({
                                    questionId: question.id,
                                    studentId: student.id,
                                    excluded: checked === true,
                                  })
                                }
                              />
                              <span>{student.name}</span>
                            </label>
                          ))
                        )}
                        <p className="text-xs text-muted-foreground">
                          Ticked students skip this question entirely.
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
      ) : null}
    </>
  );

  if (asPanel) return body;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Question controls</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One place for everything about an assignment's questions: editing the paper
 * itself and the per-question controls (credit all, delete, unassign).
 */
function QuestionEditorDialog({
  classId,
  assignmentId,
  trigger,
}: {
  classId: string;
  assignmentId: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Question editor</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">Edit questions</TabsTrigger>
            <TabsTrigger value="controls">Credit, delete &amp; unassign</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="mt-4">
            {open ? (
              <AssignmentDialog classId={classId} assignmentId={assignmentId} asPanel />
            ) : null}
          </TabsContent>
          <TabsContent value="controls" className="mt-4">
            {open ? (
              <QuestionControlsDialog classId={classId} assignmentId={assignmentId} asPanel />
            ) : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveAssignmentButton({
  classId,
  assignmentId,
  title,
}: {
  classId: string;
  assignmentId: string;
  title: string;
}) {
  const queryClient = useQueryClient();
  const archive = useServerFn(setAssignmentArchived);
  const mutation = useMutation({
    mutationFn: () => archive({ data: { assignmentId, archived: true } }),
    onSuccess: () => {
      toast.success("Assignment archived — students can no longer see it");
      queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => {
        if (
          window.confirm(
            `Archive "${title}"? Students will no longer see it. You can restore or delete it from the archive.`,
          )
        ) {
          mutation.mutate();
        }
      }}
    >
      <Archive className="size-4" />
      Archive
    </Button>
  );
}

/** Teacher-only archive: restore homework to students or delete it for good. */
function ArchivedAssignmentsDialog({
  classId,
  assignments,
}: {
  classId: string;
  assignments: TeacherAssignment[];
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const archive = useServerFn(setAssignmentArchived);
  const remove = useServerFn(deleteAssignment);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });

  const restore = useMutation({
    mutationFn: (assignmentId: string) => archive({ data: { assignmentId, archived: false } }),
    onSuccess: () => {
      toast.success("Assignment restored for students");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const destroy = useMutation({
    mutationFn: (assignmentId: string) => remove({ data: { assignmentId } }),
    onSuccess: () => {
      toast.success("Assignment deleted");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Archive className="size-4" />
          Archive ({assignments.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Archived homework</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Archived homework is hidden from students. Reactivate it to make it visible again, or
          delete it permanently along with all its submissions.
        </p>
        {assignments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing archived yet.
          </p>
        ) : (
          <ul className="divide-y">
            {assignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{assignment.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {assignment.questionCount} question(s) · {assignment.submittedCount} submitted
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(assignment.id)}
                  >
                    <RotateCcw className="size-4" />
                    Reactivate
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={destroy.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete "${assignment.title}" and all its submissions? This cannot be undone.`,
                        )
                      ) {
                        destroy.mutate(assignment.id);
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}


/** Demo account only: fill the roster with sample students to explore teacher views. */
function DemoStudentSeeder({ classId, onSeeded }: { classId: string; onSeeded: () => void }) {
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMe() });
  const seed = useServerFn(addDemoStudents);
  const mutation = useMutation({
    mutationFn: () => seed({ data: { classId } }),
    onSuccess: (result) => {
      toast.success(
        result.added > 0
          ? `Added ${result.added} sample student(s).`
          : "All sample students are already in this class.",
      );
      onSeeded();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!me.data?.isDemo) return null;

  return (
    <div className="paper mb-3 flex flex-wrap items-center justify-between gap-3 p-4">
      <p className="text-sm text-muted-foreground">
        Demo account only — add sample students so you can try the roster, gradebook and
        leaderboards without real sign-ups.
      </p>
      <Button
        variant="outline"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Adding…" : "Add sample students"}
      </Button>
    </div>
  );
}


function AiWarningLimitDialog({
  classId,
  klass,
  onSaved,
}: {
  classId: string;
  klass: { name: string; curriculum: string; subject: string; ai_warning_limit?: number | null };
  onSaved: () => void;
}) {
  const current = klass.ai_warning_limit ?? 3;
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(String(current));
  const queryClient = useQueryClient();
  const save = useServerFn(updateClass);

  useEffect(() => {
    if (open) setLimit(String(current));
  }, [open, current]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          classId,
          name: klass.name,
          curriculum: klass.curriculum,
          subject: klass.subject,
          aiWarningLimit: Number(limit),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });
      onSaved();
      toast.success("AI warning limit updated");
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const parsed = Number(limit);
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 10;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <ShieldAlert className="size-4" />
          AI warnings: {current}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI &amp; plagiarism warnings before lock</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Each answer flagged as AI-generated, copied or plagiarised adds one warning. Once a
            student goes past this limit, their homework locks and is marked as a fail until you
            unlock it.
          </p>
          <div>
            <Label htmlFor="ai-warning-limit">Warnings allowed (0–10)</Label>
            <Input
              id="ai-warning-limit"
              type="number"
              min={0}
              max={10}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="w-28"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {valid
                ? parsed === 0
                  ? "The first flagged answer locks the homework immediately."
                  : `Homework locks on flagged answer number ${parsed + 1}.`
                : "Enter a whole number between 0 and 10."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save limit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClassSettingsDialog({

  classId,
  klass,
  onSaved,
}: {
  classId: string;
  klass: { name: string; curriculum: string; subject: string; join_code: string };
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(klass.name);
  const [curriculum, setCurriculum] = useState(klass.curriculum);
  const [subject, setSubject] = useState(klass.subject);
  const [joinCode, setJoinCode] = useState(klass.join_code);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const save = useServerFn(updateClass);
  const deleteClassFn = useServerFn(deleteClass);


  useEffect(() => {
    if (!open) return;
    setName(klass.name);
    setCurriculum(klass.curriculum);
    setSubject(klass.subject);
    setJoinCode(klass.join_code);
  }, [open, klass.name, klass.curriculum, klass.subject, klass.join_code]);

  const mutation = useMutation({
    mutationFn: (input: { regenerate?: boolean }) =>
      save({
        data: {
          classId,
          name: name.trim(),
          curriculum: curriculum.trim(),
          subject: subject.trim(),
          ...(input.regenerate
            ? { regenerateJoinCode: true }
            : joinCode.trim().toUpperCase() !== klass.join_code
              ? { joinCode: joinCode.trim() }
              : {}),
        },
      }),
    onSuccess: (updated) => {
      setJoinCode(updated.join_code);
      queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });
      queryClient.invalidateQueries({ queryKey: ["teacher-classes"] });
      onSaved();
      toast.success("Class updated");
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteClassFn({ data: { classId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-classes"] });
      toast.success("Class deleted");
      setOpen(false);
      navigate({ to: "/dashboard" });
    },
    onError: (error: Error) => toast.error(error.message),
  });


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings className="size-4" />
          Class settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Class settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="class-name">Class name</Label>
            <Input id="class-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="class-curriculum">Curriculum</Label>
              <Input
                id="class-curriculum"
                value={curriculum}
                onChange={(e) => setCurriculum(e.target.value)}
                placeholder="Add text here"
              />
            </div>
            <div>
              <Label htmlFor="class-subject">Subject</Label>
              <Input
                id="class-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="class-code">Join code</Label>
            <div className="flex items-center gap-2">
              <Input
                id="class-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="font-mono uppercase"
                maxLength={10}
              />
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ regenerate: true })}
              >
                <RefreshCw className="size-4" />
                New code
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Changing the code stops the old one from working — share the new code with students.
            </p>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Delete this class? All its assignments, student work and messages will be permanently removed.",
                )
              ) {
                deleteMutation.mutate();
              }
            }}
          >
            <Trash2 className="size-4" />
            {deleteMutation.isPending ? "Deleting…" : "Delete class"}
          </Button>
          <Button
            disabled={mutation.isPending || name.trim().length === 0 || joinCode.trim().length < 4}
            onClick={() => mutation.mutate({})}
          >
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}

type GradebookStudent = {
  id: string;
  name: string;
  email: string;
  average: number | null;
  detailEnabled?: boolean;
  grades: Array<{
    assignmentId: string;
    status: string;
    awardedMarks: number | null;
    totalMarks: number;
    locked: boolean;
    aiFlagCount: number;
    penaltyPercent: number;
    resultsReleased?: boolean;
  }>;
};

function formatDuration(seconds: number) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** One gradebook row that expands into the full detail of what the student did. */
function GradebookRow({
  classId,
  student,
  titles,
  columns,
  onChanged,
  onToggleDetail,
}: {
  classId: string;
  student: GradebookStudent;
  titles: Record<string, string>;
  columns: number;
  onChanged: () => void;
  onToggleDetail: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const detailEnabled = student.detailEnabled !== false;
  const lockedGrades = student.grades.filter((grade) => grade.locked);

  return (
    <>
      <TableRow>
        <TableCell className="w-10">
          {detailEnabled ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={open ? "Hide student detail" : "Show student detail"}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </Button>
          ) : null}
        </TableCell>
        <TableCell className="font-medium">
          <span className="flex flex-wrap items-center gap-2">
            {student.name}
            {lockedGrades.map((grade) => (
              <UnlockFlag
                key={grade.assignmentId}
                assignmentId={grade.assignmentId}
                studentId={student.id}
                title={titles[grade.assignmentId] ?? "this homework"}
                penaltyPercent={grade.penaltyPercent}
                onDone={onChanged}
              />
            ))}
          </span>
        </TableCell>
        {student.grades.map((grade) => (
          <TableCell key={grade.assignmentId}>
            {grade.resultsReleased === false ? (
              <span className="text-muted-foreground">Pending</span>
            ) : grade.status === "not_started" ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <Link
                  to="/submissions/$assignmentId/$studentId"
                  params={{ assignmentId: grade.assignmentId, studentId: student.id }}
                  className="underline decoration-accent decoration-2 underline-offset-4"
                >
                  {grade.awardedMarks ?? 0}/{grade.totalMarks}
                  {grade.totalMarks > 0
                    ? ` (${Math.round(((grade.awardedMarks ?? 0) / grade.totalMarks) * 100)}%)`
                    : ""}
                  {grade.status === "in_progress" ? "*" : ""}
                </Link>
                {grade.penaltyPercent > 0 ? (
                  <Badge variant="secondary" title="Deduction applied for cheating">
                    −{grade.penaltyPercent}%
                  </Badge>
                ) : null}
              </span>
            )}
          </TableCell>
        ))}
        <TableCell className="font-display">
          {student.average === null ? "—" : `${student.average}%`}
        </TableCell>

        <TableCell>
          <Switch
            checked={detailEnabled}
            aria-label={`Detailed report for ${student.name}`}
            onCheckedChange={(checked) => {
              if (!checked) setOpen(false);
              onToggleDetail(checked);
            }}
          />
        </TableCell>
      </TableRow>
      {open && detailEnabled ? (
        <TableRow>
          <TableCell colSpan={columns} className="bg-secondary/30 p-4">
            <StudentReport classId={classId} studentId={student.id} onChanged={onChanged} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/**
 * Per-question teacher overrides for one student, shown on the question bar
 * inside that student's detailed report.
 */
function QuestionRowActions({
  classId,
  assignmentId,
  questionId,
  studentId,
  marks,
  credited,
  onDone,
}: {
  classId: string;
  assignmentId: string;
  questionId: string;
  studentId: string;
  marks: number;
  credited: boolean;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const bulkGrade = useServerFn(bulkGradeQuestion);
  const exclude = useServerFn(setQuestionExclusion);
  const [unassigned, setUnassigned] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [notifiedOpen, setNotifiedOpen] = useState(false);
  const [notifiedReason, setNotifiedReason] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"credit" | "reject" | null>(
    credited && marks > 0 ? "credit" : null,
  );

  function done() {
    queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });
    onDone();
  }

  const grade = useMutation({
    mutationFn: (vars: { action: "credit" | "reject"; note?: string }) =>
      bulkGrade({
        data: {
          assignmentId,
          questionId,
          action: vars.action,
          studentIds: [studentId],
          note: vars.note,
        },
      }),
    onSuccess: (_result, vars) => {
      toast.success(
        vars.action === "credit"
          ? `Full marks (${marks}) given`
          : "Sent back to the student to redo",
      );
      setLastAction(vars.action);
      setRejectOpen(false);
      if (vars.action === "reject") {
        setNotifiedReason(vars.note || null);
        setNotifiedOpen(true);
      }
      done();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unassign = useMutation({
    mutationFn: (next: boolean) =>
      exclude({ data: { questionId, studentId, excluded: next } }),
    onSuccess: (_result, next) => {
      setUnassigned(next);
      toast.success(next ? "Question unassigned for this student" : "Question reassigned");
      done();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = grade.isPending || unassign.isPending;

  return (
    <span
      className="flex shrink-0 flex-wrap items-center gap-1"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {lastAction ? (
        <span className="text-xs text-muted-foreground">
          {lastAction === "credit" ? "Credited" : "Sent back to redo"}
        </span>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={busy || unassigned || lastAction === "credit"}
        onClick={() => grade.mutate({ action: "credit" })}
      >
        Credit
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || unassigned || lastAction === "reject"}
        onClick={() => setRejectOpen(true)}
      >
        Reject answer
      </Button>
      <RejectReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        busy={grade.isPending}
        onConfirm={(note) => grade.mutate(note ? { action: "reject", note } : { action: "reject" })}
      />
      <StudentNotifiedDialog
        open={notifiedOpen}
        onOpenChange={setNotifiedOpen}
        reason={notifiedReason}
      />

      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => unassign.mutate(!unassigned)}
      >
        {unassigned ? "Reassign question" : "Unassign question"}
      </Button>
    </span>
  );
}


function StudentReport({
  classId,
  studentId,
  onChanged,
}: {
  classId: string;
  studentId: string;
  onChanged: () => void;
}) {
  const report = useQuery({
    queryKey: ["student-report", classId, studentId],
    queryFn: () => getStudentClassReport({ data: { classId, studentId } }),
    retry: 1,
  });

  if (report.isPending) return <Skeleton className="h-40 w-full" />;
  if (report.isError) {
    return (
      <div className="text-center">
        <p className="mb-3 text-sm text-muted-foreground">
          We couldn&apos;t load this student&apos;s work. {(report.error as Error).message}
        </p>
        <Button size="sm" onClick={() => report.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const rows = (report.data?.assignments ?? []).filter((a) => a.status !== "not_started");
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">This student hasn&apos;t started yet.</p>;
  }

  return (
    <div className="space-y-4">
      {rows.map((assignment) => (
        <div key={assignment.assignmentId} className="paper p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg">{assignment.title}</h3>
              <p className="text-xs text-muted-foreground">
                {assignment.awardedMarks ?? 0}/{assignment.totalMarks} marks ·{" "}
                {assignment.attempts} attempts · {formatDuration(assignment.timeSpentSeconds)} spent
                {assignment.penaltyPercent > 0 ? ` · −${assignment.penaltyPercent}% deduction` : ""}
                {assignment.aiFlagCount > 0 ? ` · ${assignment.aiFlagCount} AI warning(s)` : ""}
              </p>
            </div>
            {assignment.penaltyPercent > 0 ? (
              <Badge variant="secondary">−{assignment.penaltyPercent}% cheating deduction</Badge>
            ) : null}

          </div>
          {assignment.locked ? (
            <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {assignment.lockedReason ??
                "Locked automatically after passing the class warning limit for AI-generated or copied answers."}
            </p>
          ) : null}

          <div className="mt-3 space-y-2">
            {assignment.questions.map((question) => (
              <details key={question.id} className="rounded-md border border-border bg-background p-3">
                <summary className="cursor-pointer text-sm">
                  <span className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-center justify-between gap-2 align-middle">
                    <span className="min-w-0">
                      <span className="font-medium">
                        Q{questionLabel(question.questionText, question.position - 1)}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {question.awardedMarks ?? 0}/{question.marks} marks · {question.attempts}{" "}
                        attempts · {formatDuration(question.timeSpentSeconds)} ·{" "}
                        {question.tutorPrompts.filter((m) => m.role === "student").length} tutor
                        questions
                      </span>
                    </span>
                    <QuestionRowActions
                      classId={classId}
                      assignmentId={assignment.assignmentId}
                      questionId={question.id}
                      studentId={studentId}
                      marks={question.marks}
                      credited={(question.awardedMarks ?? 0) >= question.marks}

                      onDone={() => {
                        report.refetch();
                        onChanged();
                      }}
                    />
                  </span>
                </summary>


                {question.history.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Attempt history
                    </p>
                    <ol className="mt-2 space-y-2">
                      {question.history.map((attempt, attemptIndex) => (
                        <li
                          key={`${attempt.at}-${attemptIndex}`}
                          className="rounded-md bg-secondary/40 p-2 text-sm"
                        >
                          <p className="text-xs text-muted-foreground">
                            Attempt {attemptIndex + 1} ·{" "}
                            {attempt.verdict === "correct"
                              ? "correct"
                              : attempt.verdict === "partial"
                                ? "partly right"
                                : "incorrect"}{" "}
                            · {attempt.awardedMarks}/{question.marks}
                            {attempt.at ? ` · ${new Date(attempt.at).toLocaleString()}` : ""}
                          </p>
                          {attempt.answerText ? (
                            <p className="mt-1 whitespace-pre-wrap">{attempt.answerText}</p>
                          ) : null}
                          {attempt.imageUrls.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {attempt.imageUrls.map((url) => (
                                <a key={url} href={url} target="_blank" rel="noreferrer">
                                  <img
                                    src={url}
                                    alt="Student working"
                                    loading="lazy"
                                    className="size-20 rounded border border-border object-cover"
                                  />
                                </a>
                              ))}
                            </div>
                          ) : null}
                          {attempt.feedback ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Feedback: {attempt.feedback}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No attempts recorded yet.</p>
                )}

                {question.tutorPrompts.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      AI tutor conversation
                    </p>
                    <div className="mt-2 space-y-2">
                      {question.tutorPrompts.map((message) => (
                        <div
                          key={message.id}
                          className={
                            message.role === "student"
                              ? "rounded-md bg-primary/10 p-2 text-sm"
                              : "rounded-md bg-secondary/40 p-2 text-sm"
                          }
                        >
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {message.role === "student" ? "Student asked" : "Tutor"}
                          </p>
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </details>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Lock flag shown beside the student name in the gradebook. Clicking a locked
 * flag opens a dialog where the teacher sets the cheating deduction and unlocks.
 */
function UnlockFlag({
  assignmentId,
  studentId,
  title,
  penaltyPercent,
  onDone,
}: {
  assignmentId: string;
  studentId: string;
  title: string;
  penaltyPercent: number;
  onDone: () => void;
}) {
  const unlock = useServerFn(unlockSubmission);
  const [open, setOpen] = useState(false);
  const [penalty, setPenalty] = useState(String(penaltyPercent || ""));

  const mutation = useMutation({
    mutationFn: () =>
      unlock({
        data: {
          assignmentId,
          studentId,
          penaltyPercent: Math.min(100, Math.max(0, Number(penalty) || 0)),
        },
      }),
    onSuccess: () => {
      toast.success(
        Number(penalty) > 0
          ? `Unlocked with a ${Number(penalty)}% deduction.`
          : "Homework unlocked — the student can try again.",
      );
      setOpen(false);
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title={`${title} — locked for AI or copied answers. Click to unlock.`}
          className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground"
        >
          <Lock className="size-3" /> Locked
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlock {title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This homework was locked after repeated AI-generated or copied answers. Choose the
          percentage to deduct for cheating, then unlock so the student can continue. The deduction
          is shown beside their score.
        </p>
        <div className="flex items-center gap-2">
          <Label htmlFor={`penalty-${assignmentId}-${studentId}`} className="text-sm">
            Deduct
          </Label>
          <Input
            id={`penalty-${assignmentId}-${studentId}`}
            type="number"
            min={0}
            max={100}
            value={penalty}
            onChange={(event) => setPenalty(event.target.value)}
            className="h-9 w-24"
            placeholder="0"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <Unlock className="size-4" /> Unlock homework
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/** Exports every student's grade for every assignment in the class. */
function downloadGradebook(
  className: string,
  assignments: Array<{ id: string; title: string; totalMarks: number; dueAt: string | null }>,
  students: GradebookStudent[],
) {
  const header = [
    "Student",
    ...assignments.map((a) => `${a.title} (%)`),
    "Average %",
  ];
  const rows = students.map((student) => [
    student.name,
    ...student.grades.map((grade) => {
      if (grade.resultsReleased === false) return "Pending";
      if (grade.status === "not_started") return "Not started";
      if (!grade.totalMarks) return "—";
      const pct = ((grade.awardedMarks ?? 0) / grade.totalMarks) * 100;
      return `${Math.round(pct)}%`;
    }),
    student.average === null ? "" : `${Math.round(student.average)}%`,
  ]);
  downloadXlsx(`${className} gradebook`, "Gradebook", [header, ...rows]);
}
