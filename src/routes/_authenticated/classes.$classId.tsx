import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
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
import { Skeleton } from "@/components/ui/skeleton";
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
import { createAssignment, extractPaperQuestions, getClassOverview } from "@/lib/app.functions";

export const Route = createFileRoute("/_authenticated/classes/$classId")({
  head: () => ({
    meta: [
      { title: "Class · StepWise" },
      { name: "description", content: "Class assignments, students and homework grades." },
      { property: "og:title", content: "Class · StepWise" },
      { property: "og:description", content: "Class assignments, students and homework grades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClassPage,
  pendingComponent: () => (
    <div className="min-h-screen">
      <AppHeader role="teacher" />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="h-64 w-full" />
      </main>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen">
      <AppHeader role="teacher" />
      <main className="mx-auto max-w-6xl px-4 py-8 text-center">
        <p className="mb-4 text-muted-foreground">We couldn&apos;t load this class. {error.message}</p>
        <Button onClick={reset}>Try again</Button>
      </main>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Class not found.</div>,
});

type QuestionDraft = { questionText: string; markScheme: string; marks: number };

function ClassPage() {
  const { classId } = Route.useParams();
  const overview = useQuery({
    queryKey: ["class-overview", classId],
    queryFn: () => getClassOverview({ data: { classId } }),
    retry: 2,
  });

  return (
    <div className="min-h-screen">
      <AppHeader role="teacher" />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← All classes
        </Link>

        {overview.isPending ? (
          <Skeleton className="mt-6 h-64 w-full" />
        ) : overview.isError ? (
          <div className="mt-6 text-center">
            <p className="mb-4 text-muted-foreground">
              We couldn&apos;t load this class. {(overview.error as Error).message}
            </p>
            <Button onClick={() => overview.refetch()}>Retry</Button>
          </div>
        ) : overview.data ? (

          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl">{overview.data.klass.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {overview.data.klass.curriculum} · {overview.data.klass.subject} · join code{" "}
                  <span className="font-mono highlight-underline">
                    {overview.data.klass.join_code}
                  </span>
                </p>
              </div>
              <NewAssignmentDialog classId={classId} />
            </div>

            <Tabs defaultValue="assignments" className="mt-6">
              <TabsList>
                <TabsTrigger value="assignments">Assignments</TabsTrigger>
                <TabsTrigger value="gradebook">Gradebook</TabsTrigger>
                <TabsTrigger value="students">Students</TabsTrigger>
              </TabsList>

              <TabsContent value="assignments" className="mt-4 space-y-3">
                {overview.data.assignments.length === 0 ? (
                  <div className="paper p-8 text-center text-muted-foreground">
                    No assignments yet. Add past-paper questions with their mark schemes.
                  </div>
                ) : (
                  overview.data.assignments.map((assignment) => (
                    <div key={assignment.id} className="paper flex flex-wrap items-center justify-between gap-4 p-5">
                      <div>
                        <h2 className="text-xl">{assignment.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {assignment.questionCount} questions · {assignment.totalMarks} marks
                          {assignment.dueAt
                            ? ` · due ${new Date(assignment.dueAt).toLocaleDateString()}`
                            : ""}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {assignment.submittedCount} submitted
                      </Badge>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="gradebook" className="mt-4">
                {overview.data.students.length === 0 ? (
                  <div className="paper p-8 text-center text-muted-foreground">
                    No students have joined yet.
                  </div>
                ) : (
                  <div className="paper overflow-x-auto p-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          {overview.data.assignments.map((assignment) => (
                            <TableHead key={assignment.id}>{assignment.title}</TableHead>
                          ))}
                          <TableHead>Average</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.data.students.map((student) => (
                          <TableRow key={student.id}>
                            <TableCell className="font-medium">{student.name}</TableCell>
                            {student.grades.map((grade) => (
                              <TableCell key={grade.assignmentId}>
                                {grade.status === "not_started" ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <Link
                                    to="/submissions/$assignmentId/$studentId"
                                    params={{
                                      assignmentId: grade.assignmentId,
                                      studentId: student.id,
                                    }}
                                    className="underline decoration-accent decoration-2 underline-offset-4"
                                  >
                                    {grade.awardedMarks ?? 0}/{grade.totalMarks}
                                    {grade.status === "in_progress" ? "*" : ""}
                                  </Link>
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="font-display">
                              {student.average === null ? "—" : `${student.average}%`}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <p className="p-3 text-xs text-muted-foreground">
                      * still in progress. Click a score to review answers and adjust marks.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="students" className="mt-4">
                <div className="paper divide-y divide-border">
                  {overview.data.students.length === 0 ? (
                    <p className="p-6 text-center text-muted-foreground">
                      Share the join code so students can add themselves.
                    </p>
                  ) : (
                    overview.data.students.map((student) => (
                      <div key={student.id} className="flex items-center justify-between p-4">
                        <span>{student.name}</span>
                        <span className="text-sm text-muted-foreground">{student.email}</span>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </main>
    </div>
  );
}

async function toUploadFile(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return {
    filename: file.name,
    mimeType: file.type || "application/pdf",
    base64: btoa(binary),
  };
}

function NewAssignmentDialog({ classId }: { classId: string }) {
  const queryClient = useQueryClient();
  const create = useServerFn(createAssignment);
  const extract = useServerFn(extractPaperQuestions);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [paperFiles, setPaperFiles] = useState<File[]>([]);
  const [schemeFiles, setSchemeFiles] = useState<File[]>([]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    { questionText: "", markScheme: "", marks: 1 },
  ]);

  const extractMutation = useMutation({
    mutationFn: async () => {
      const [paper, scheme] = await Promise.all([
        Promise.all(paperFiles.map(toUploadFile)),
        Promise.all(schemeFiles.map(toUploadFile)),
      ]);
      return extract({
        data: { classId, subject, paperFiles: paper, markSchemeFiles: scheme },
      });
    },
    onSuccess: (result) => {
      setQuestions(result.questions);
      toast.success(`${result.questions.length} questions read from your files`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          classId,
          title,
          subject,
          instructions,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          questions: questions.map((q) => ({
            questionText: q.questionText.trim(),
            markScheme: q.markScheme.trim(),
            marks: q.marks,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Assignment set");
      setOpen(false);
      setTitle("");
      setInstructions("");
      setDueAt("");
      setQuestions([{ questionText: "", markScheme: "", marks: 1 }]);
      queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const valid =
    title.trim().length > 0 &&
    questions.length > 0 &&
    questions.every((q) => q.questionText.trim() && q.markScheme.trim() && q.marks > 0);

  function update(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New assignment</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set past-paper homework</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="June 2023 Paper 2 — Q1-Q4"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject / topic</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Rates of reaction"
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
              <Label htmlFor="due">Due date (optional)</Label>
              <Input
                id="due"
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-4">
            <h3 className="font-display text-lg">Upload past paper &amp; mark scheme</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              PDFs or photos. Combined in one file, or paper and mark scheme separately — the AI
              aligns each question with its marking points, and you can edit before saving.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="paper-files">Past paper (or combined file)</Label>
                <Input
                  id="paper-files"
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  onChange={(event) => setPaperFiles(Array.from(event.target.files ?? []))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheme-files">Mark scheme (optional if combined)</Label>
                <Input
                  id="scheme-files"
                  type="file"
                  accept="application/pdf,image/*"
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
              {extractMutation.isPending ? "Reading paper..." : "Build questions with AI"}
            </Button>
          </div>


          <div className="space-y-4">
            {questions.map((question, index) => (
              <div key={index} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg">Question {index + 1}</h3>
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
                  <Textarea
                    value={question.questionText}
                    onChange={(event) => update(index, { questionText: event.target.value })}
                    placeholder="Paste the past-paper question here"
                    rows={3}
                  />
                  <Textarea
                    value={question.markScheme}
                    onChange={(event) => update(index, { markScheme: event.target.value })}
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
                        update(index, { marks: Math.max(1, Number(event.target.value) || 1) })
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
                setQuestions((prev) => [...prev, { questionText: "", markScheme: "", marks: 1 }])
              }
            >
              <Plus className="size-4" />
              Add question
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Set homework"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
