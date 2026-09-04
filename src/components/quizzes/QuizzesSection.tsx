import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { extractPaperQuestions, listTeacherClasses } from "@/lib/app.functions";
import { filesToPages } from "@/lib/pdf-pages";
import {
  createQuiz,
  deleteQuiz,
  endQuiz,
  getQuizRoster,
  listQuizzes,
  listStudentQuizzes,
  releaseQuiz,
  setQuizRevealMarkScheme,
} from "@/lib/quizzes.functions";

export function QuizzesSection({
  classId,
  role,
}: {
  classId: string;
  role: "teacher" | "student";
}) {
  return role === "teacher" ? (
    <TeacherQuizzes classId={classId} />
  ) : (
    <StudentQuizzes classId={classId} />
  );
}

/* ------------------------------------------------------------- teacher ---- */

function TeacherQuizzes({ classId }: { classId: string }) {
  const activeClassId = classId;

  const quizzes = useQuery({
    queryKey: ["quizzes", activeClassId],
    queryFn: () => listQuizzesFn({ data: { classId: activeClassId } }),
    enabled: Boolean(activeClassId),
  });
  const listQuizzesFn = useServerFn(listQuizzes);


  const queryClient = useQueryClient();
  const release = useServerFn(releaseQuiz);
  const end = useServerFn(endQuiz);
  const remove = useServerFn(deleteQuiz);
  const reveal = useServerFn(setQuizRevealMarkScheme);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["quizzes", activeClassId] });

  const releaseMutation = useMutation({
    mutationFn: (input: { quizId: string; released: boolean }) => release({ data: input }),
    onSuccess: (_r, input) => {
      toast.success(input.released ? "Quiz released to the class" : "Quiz locked again");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const endMutation = useMutation({
    mutationFn: (quizId: string) => end({ data: { quizId } }),
    onSuccess: (result) => {
      toast.success(`Quiz ended — ${result.graded} attempt(s) marked`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (quizId: string) => remove({ data: { quizId } }),
    onSuccess: () => {
      toast.success("Quiz deleted");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const revealMutation = useMutation({
    mutationFn: (input: { quizId: string; reveal: boolean }) => reveal({ data: input }),
    onSuccess: (_r, input) => {
      toast.success(input.reveal ? "Mark scheme released to students" : "Mark scheme hidden from students");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div className="paper flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h2 className="text-3xl">Timed quizzes</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Upload a past paper and mark scheme, set the time limit, then release the quiz when the
            class is ready. Copy, paste, screenshots and snipping tools are blocked for students,
            there is no AI tutor, and nothing is marked or explained until the timer ends.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {activeClassId ? <QuizDialog classId={activeClassId} onSaved={refresh} /> : null}
        </div>
      </div>

      {quizzes.isLoading ? (
        <Skeleton className="h-32 w-full" />

      ) : (quizzes.data ?? []).length === 0 ? (
        <div className="paper p-8 text-center text-muted-foreground">
          No quizzes in this class yet.
        </div>
      ) : (
        <div className="space-y-3">
          {(quizzes.data ?? []).map((quiz) => (
            <div key={quiz.id} className="paper p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl">{quiz.title}</h3>
                    <Badge variant={quiz.releasedAt ? "default" : "secondary"}>
                      {quiz.closedAt ? "Ended" : quiz.releasedAt ? "Live" : "Locked"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {quiz.questionCount} questions · {quiz.totalMarks} marks ·{" "}
                    {quiz.timeLimitMinutes} min · {quiz.startedCount} started,{" "}
                    {quiz.submittedCount} finished
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    At the end: {quiz.showScore ? "score shown" : "score hidden"} ·{" "}
                    {quiz.revealMarkScheme ? "mark scheme revealed" : "mark scheme hidden"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RosterDialog quizId={quiz.id} title={quiz.title} />
                  {quiz.releasedAt && !quiz.closedAt ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => endMutation.mutate(quiz.id)}
                        disabled={endMutation.isPending}
                      >
                        End quiz
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          releaseMutation.mutate({ quizId: quiz.id, released: false })
                        }
                      >
                        Lock
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => releaseMutation.mutate({ quizId: quiz.id, released: true })}
                      disabled={releaseMutation.isPending}
                    >
                      Release quiz
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Delete this quiz and all its results?")) {
                        deleteMutation.mutate(quiz.id);
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RosterDialog({ quizId, title }: { quizId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const load = useServerFn(getQuizRoster);
  const roster = useQuery({
    queryKey: ["quiz-roster", quizId],
    queryFn: () => load({ data: { quizId } }),
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Live roster
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {roster.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="divide-y">
            {(roster.data?.students ?? []).map((student) => (
              <div key={student.studentId} className="flex items-center justify-between py-2">
                <span className="text-sm">{student.name}</span>
                <span className="text-sm text-muted-foreground">
                  {student.status === "submitted"
                    ? `${student.awardedMarks}/${student.totalMarks}`
                    : student.status === "in_progress"
                      ? "Working…"
                      : "Not started"}
                </span>
              </div>
            ))}
            {(roster.data?.students ?? []).length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No students in this class yet.</p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type QuestionDraft = {
  questionText: string;
  markScheme: string;
  marks: number;
  imagePaths: string[];
  imageUrls: string[];
};

function QuizDialog({ classId, onSaved }: { classId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [instructions, setInstructions] = useState("");
  const [timeLimit, setTimeLimit] = useState(30);
  const [revealMarkScheme, setRevealMarkScheme] = useState(true);
  const [showScore, setShowScore] = useState(true);
  const [paperFiles, setPaperFiles] = useState<File[]>([]);
  const [schemeFiles, setSchemeFiles] = useState<File[]>([]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);

  const extract = useServerFn(extractPaperQuestions);
  const create = useServerFn(createQuiz);

  const extraction = useMutation({
    mutationFn: async () => {
      const [paper, scheme] = await Promise.all([
        filesToPages(paperFiles),
        filesToPages(schemeFiles),
      ]);
      return extract({ data: { classId, subject, paperFiles: paper, markSchemeFiles: scheme } });
    },
    onSuccess: (result) => {
      setQuestions(
        result.questions.map((q) => ({
          questionText: q.questionText,
          markScheme: q.markScheme,
          marks: q.marks,
          imagePaths: q.imagePaths ?? [],
          imageUrls: q.imageUrls ?? [],
        })),
      );
      toast.success(`${result.questions.length} questions read from your files`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: () =>
      create({
        data: {
          classId,
          title,
          subject,
          instructions,
          timeLimitMinutes: timeLimit,
          revealMarkScheme,
          showScore,
          questions: questions.map((q) => ({
            questionText: q.questionText,
            markScheme: q.markScheme,
            marks: q.marks,
            imagePaths: q.imagePaths,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Quiz created — release it when the class is ready");
      setOpen(false);
      setTitle("");
      setQuestions([]);
      setPaperFiles([]);
      setSchemeFiles([]);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New quiz</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New timed quiz</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quiz-title">Title *</Label>
              <Input
                id="quiz-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Add text here"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiz-subject">Subject (optional)</Label>
              <Input
                id="quiz-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Add text here"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quiz-instructions">Instructions for students</Label>
            <Textarea
              id="quiz-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="quiz-time">Time limit (minutes)</Label>
              <Input
                id="quiz-time"
                type="number"
                min={1}
                max={300}
                value={timeLimit}
                onChange={(event) => setTimeLimit(Number(event.target.value) || 1)}
              />
            </div>
            <label className="flex items-center gap-2 pt-8 text-sm">
              <Checkbox
                checked={revealMarkScheme}
                onCheckedChange={(value) => setRevealMarkScheme(value === true)}
              />
              Reveal mark scheme at the end
            </label>
            <label className="flex items-center gap-2 pt-8 text-sm">
              <Checkbox
                checked={showScore}
                onCheckedChange={(value) => setShowScore(value === true)}
              />
              Show score at the end
            </label>
          </div>

          <div className="rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">Past paper and mark scheme</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="quiz-paper">Question paper (PDF or images)</Label>
                <Input
                  id="quiz-paper"
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  onChange={(event) => setPaperFiles(Array.from(event.target.files ?? []))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiz-scheme">Mark scheme (optional separate file)</Label>
                <Input
                  id="quiz-scheme"
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  onChange={(event) => setSchemeFiles(Array.from(event.target.files ?? []))}
                />
              </div>
            </div>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => extraction.mutate()}
              disabled={paperFiles.length === 0 || extraction.isPending}
            >
              {extraction.isPending ? "Reading paper…" : "Read questions from files"}
            </Button>
          </div>

          {questions.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">{questions.length} questions</p>
              {questions.map((question, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm">{question.questionText}</p>
                    <Input
                      className="w-20"
                      type="number"
                      min={1}
                      value={question.marks}
                      onChange={(event) =>
                        setQuestions((current) =>
                          current.map((q, i) =>
                            i === index ? { ...q, marks: Number(event.target.value) || 1 } : q,
                          ),
                        )
                      }
                    />
                  </div>
                  <Textarea
                    className="mt-2"
                    rows={2}
                    value={question.markScheme}
                    onChange={(event) =>
                      setQuestions((current) =>
                        current.map((q, i) =>
                          i === index ? { ...q, markScheme: event.target.value } : q,
                        ),
                      )
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    onClick={() =>
                      setQuestions((current) => current.filter((_q, i) => i !== index))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            disabled={!title.trim() || questions.length === 0 || save.isPending}
          >
            Create quiz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------- student ---- */

function StudentQuizzes({ classId }: { classId: string }) {
  const quizzes = useQuery({
    queryKey: ["student-quizzes"],
    queryFn: useServerFn(listStudentQuizzes),
    refetchInterval: 30_000,
  });

  const classQuizzes = (quizzes.data?.quizzes ?? []).filter((q) => q.classId === classId);

  return (
    <div className="space-y-6">
      <div className="paper p-5">
        <h2 className="text-3xl">Your quizzes</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Quizzes are timed. Once you open one the clock starts, there is no tutor and nothing is
          marked until you submit or the time runs out.
        </p>
      </div>

      {quizzes.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : classQuizzes.length === 0 ? (
        <div className="paper p-8 text-center text-muted-foreground">
          No quizzes released in this class yet. Your teacher releases them in class.
        </div>
      ) : (
        (quizzes.data?.classes ?? []).filter((klass) => klass.id === classId).map((klass) => {
          const items = classQuizzes;
          if (items.length === 0) return null;
          return (
            <section key={klass.id} className="paper p-5">
              <h3 className="border-b pb-3 font-display text-2xl">{klass.name}</h3>

              <div className="divide-y">
                {items.map((quiz) => (
                  <div key={quiz.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{quiz.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {quiz.timeLimitMinutes} min · {quiz.totalMarks} marks
                        {quiz.status === "submitted" && quiz.showScore
                          ? ` · scored ${quiz.awardedMarks}/${quiz.totalMarks}`
                          : ""}
                      </p>
                    </div>
                    <Button asChild variant={quiz.status === "submitted" ? "outline" : "default"}>
                      <Link to="/quiz/$quizId" params={{ quizId: quiz.id }}>
                        {quiz.status === "submitted"
                          ? "View result"
                          : quiz.status === "in_progress"
                            ? "Continue"
                            : "Start quiz"}
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

/** Shared countdown display used by the quiz workspace. */
export function useCountdown(secondsLeft: number | undefined, onExpire: () => void) {
  const [seconds, setSeconds] = useState(secondsLeft ?? 0);

  useEffect(() => {
    setSeconds(secondsLeft ?? 0);
  }, [secondsLeft]);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          onExpire();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds > 0]);

  return seconds;
}

export function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
