import { normalisePhotoFile } from "@/lib/heic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cleanMathText } from "@/lib/math-text";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { formatClock } from "@/components/quizzes/QuizzesSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getQuizWorkspace, saveQuizAnswer, submitQuiz } from "@/lib/quizzes.functions";

export const Route = createFileRoute("/_authenticated/quiz/$quizId")({
  head: () => ({
    meta: [
      { title: "Timed quiz · PastPaperHelper.AI" },
      { name: "description", content: "Answer a timed quiz released by your teacher." },
      { property: "og:title", content: "Timed quiz · PastPaperHelper.AI" },
      { property: "og:description", content: "Answer a timed quiz released by your teacher." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuizPage,
  notFoundComponent: () => <div className="p-8 text-center">Quiz not found.</div>,
});

function QuizPage() {
  const { quizId } = Route.useParams();
  const queryClient = useQueryClient();
  const load = useServerFn(getQuizWorkspace);
  const save = useServerFn(saveQuizAnswer);
  const submit = useServerFn(submitQuiz);

  const workspace = useQuery({
    queryKey: ["quiz-workspace", quizId],
    queryFn: () => load({ data: { quizId } }),
  });

  const [seconds, setSeconds] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!workspace.data) return;
    setSeconds(workspace.data.attempt.secondsLeft);
    setDrafts(
      Object.fromEntries(workspace.data.questions.map((q) => [q.id, q.answerText])),
    );
  }, [workspace.data]);

  const finished = workspace.data?.attempt.status === "submitted";

  const submitMutation = useMutation({
    mutationFn: () => submit({ data: { quizId } }),
    onSuccess: () => {
      toast.success("Quiz submitted — marking now");
      queryClient.invalidateQueries({ queryKey: ["quiz-workspace", quizId] });
      queryClient.invalidateQueries({ queryKey: ["student-quizzes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (finished || seconds <= 0) return;
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          submitMutation.mutate();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finished, seconds > 0]);

  const saveMutation = useMutation({
    mutationFn: (input: {
      questionId: string;
      answerText: string;
      images?: { mimeType: string; base64: string }[];
    }) =>
      save({
        data: {
          quizId,
          questionId: input.questionId,
          answerText: input.answerText,
          images: input.images ?? [],
        },
      }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="min-h-screen">
      <AppHeader role="student" />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {workspace.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : workspace.isError ? (
          <div className="paper p-8 text-center">
            <p className="mb-4 text-muted-foreground">{(workspace.error as Error).message}</p>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to your classes</Link>
            </Button>
          </div>
        ) : workspace.data ? (
          <>
            <div className="paper sticky top-16 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <h1 className="font-display text-2xl">{workspace.data.quiz.title}</h1>
                <p className="text-sm text-muted-foreground">
                  {workspace.data.quiz.instructions || "Answer every question before time runs out."}
                </p>
              </div>
              {finished ? (
                <Badge variant="secondary">
                  {workspace.data.quiz.showScore
                    ? `${workspace.data.attempt.awardedMarks}/${workspace.data.attempt.totalMarks}`
                    : "Submitted"}
                </Badge>
              ) : (
                <span
                  className={`font-mono text-2xl ${seconds < 60 ? "text-destructive" : ""}`}
                  aria-live="polite"
                >
                  {formatClock(seconds)}
                </span>
              )}
            </div>

            {!finished ? (
              <p className="mb-4 text-sm text-muted-foreground">
                Quiz conditions: English only, no AI tutor, no vocab list and no hover
                translations. Copy, paste, screenshots and snipping tools are blocked. Your answers
                are only marked after you submit or the timer runs out.
              </p>
            ) : null}

            <div className="space-y-4">
              {workspace.data.questions.map((question) => (
                <section key={question.id} className="paper p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-wrap text-sm">{cleanMathText(question.questionText)}</p>
                    <Badge variant="outline">{question.marks} marks</Badge>
                  </div>
                  {question.imageUrls.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt="Question page"
                      className="mt-3 w-full rounded-md border"
                    />
                  ))}

                  {finished ? (
                    <div className="mt-3 space-y-2">
                      <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                        {question.answerText || "No answer given."}
                      </p>
                      {question.answerImageUrls.map((url) => (
                        <img key={url} src={url} alt="Your work" className="w-full rounded-md border" />
                      ))}
                      {question.result ? (
                        <p className="text-sm">
                          <span className="font-medium">
                            {question.result.awardedMarks}/{question.marks} marks.
                          </span>{" "}
                          {question.result.feedback}
                        </p>
                      ) : null}
                      {question.markScheme ? (
                        <div className="rounded-md border p-3 text-sm">
                          <p className="font-medium">Mark scheme</p>
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                            {cleanMathText(question.markScheme)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        rows={4}
                        value={drafts[question.id] ?? ""}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [question.id]: event.target.value }))
                        }
                        onBlur={() =>
                          saveMutation.mutate({
                            questionId: question.id,
                            answerText: drafts[question.id] ?? "",
                          })
                        }
                        placeholder="Type your answer in English"
                      />
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground" htmlFor={`photo-${question.id}`}>
                          Optional: photo of working or a diagram
                        </label>
                        <Input
                          id={`photo-${question.id}`}
                          type="file"
                          accept="image/*"
                          onChange={async (event) => {
                            const picked = event.target.files?.[0];
                            if (!picked) return;
                            // iPhone HEIC photos become JPEGs so they can be shown and marked.
                            const file = await normalisePhotoFile(picked);
                            const base64 = await fileToBase64(file);
                            saveMutation.mutate({
                              questionId: question.id,
                              answerText: drafts[question.id] ?? "",
                              images: [{ mimeType: file.type || "image/jpeg", base64 }],
                            });
                            toast.success("Photo attached");
                          }}
                        />
                      </div>
                    </div>
                  )}
                </section>
              ))}
            </div>

            <div className="mt-6 flex justify-between gap-3">
              <Button asChild variant="outline">
                <Link to="/dashboard">Back to your classes</Link>
              </Button>
              {!finished ? (
                <Button
                  onClick={() => {
                    if (confirm("Submit your quiz for marking? You cannot change it after this.")) {
                      submitMutation.mutate();
                    }
                  }}
                  disabled={submitMutation.isPending}
                >
                  Submit quiz
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
