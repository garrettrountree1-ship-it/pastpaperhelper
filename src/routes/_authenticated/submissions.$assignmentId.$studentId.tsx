import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { questionBody, questionLabel } from "@/lib/question-label";

import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getSubmissionDetail, overrideAnswerMarks } from "@/lib/app.functions";

type MarkPoint = { point: string; marks: number; awarded: boolean };

function formatDuration(seconds: number) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export const Route = createFileRoute("/_authenticated/submissions/$assignmentId/$studentId")({
  head: () => ({
    meta: [
      { title: "Review submission · StepWise" },
      { name: "description", content: "Review a student's answers and adjust their marks." },
      { property: "og:title", content: "Review submission · StepWise" },
      {
        property: "og:description",
        content: "Review a student's answers and adjust their marks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SubmissionPage,
  pendingComponent: () => (
    <div className="min-h-screen">
      <AppHeader role="teacher" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-64 w-full" />
      </main>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen">
      <AppHeader role="teacher" />
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <p className="mb-4 text-muted-foreground">
          We couldn&apos;t load this submission. {error.message}
        </p>
        <Button onClick={reset}>Try again</Button>
      </main>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Submission not found.</div>,
});

function SubmissionPage() {
  const { assignmentId, studentId } = Route.useParams();
  const queryKey = ["submission", assignmentId, studentId];
  const detail = useQuery({
    queryKey,
    queryFn: () => getSubmissionDetail({ data: { assignmentId, studentId } }),
    retry: 2,
  });

  return (
    <div className="min-h-screen">
      <AppHeader role="teacher" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Back
        </Link>

        {detail.isPending ? (
          <Skeleton className="mt-6 h-64 w-full" />
        ) : detail.isError ? (
          <div className="mt-6 text-center">
            <p className="mb-4 text-muted-foreground">
              We couldn&apos;t load this submission. {(detail.error as Error).message}
            </p>
            <Button onClick={() => detail.refetch()}>Retry</Button>
          </div>
        ) : detail.data ? (

          <>
            <div className="mt-4 flex items-center justify-between gap-4">
              <h1 className="text-3xl">Submission review</h1>
              <Badge>
                {detail.data.submission?.awarded_marks ?? 0}/
                {detail.data.submission?.total_marks ?? 0} marks
              </Badge>
            </div>

            {(() => {
              const answers = detail.data.answers as Array<{
                attempts?: number;
                time_spent_seconds?: number;
              }>;
              const awarded = Number(detail.data.submission?.awarded_marks ?? 0);
              const total = Number(
                detail.data.submission?.total_marks ??
                  detail.data.questions.reduce((sum, q) => sum + q.marks, 0),
              );
              const percent = total > 0 ? Math.round((awarded / total) * 100) : 0;
              const attempts = answers.reduce((sum, a) => sum + (a.attempts ?? 0), 0);
              const time = answers.reduce((sum, a) => sum + (a.time_spent_seconds ?? 0), 0);
              return (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="paper p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Overall score
                    </p>
                    <p className="font-display text-2xl">{percent}%</p>
                    <p className="text-xs text-muted-foreground">
                      {awarded}/{total} marks
                    </p>
                  </div>
                  <div className="paper p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Total attempts
                    </p>
                    <p className="font-display text-2xl">{attempts}</p>
                    <p className="text-xs text-muted-foreground">
                      across {detail.data.questions.length} question parts
                    </p>
                  </div>
                  <div className="paper p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Time spent
                    </p>
                    <p className="font-display text-2xl">{formatDuration(time)}</p>
                    <p className="text-xs text-muted-foreground">active time on questions</p>
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 space-y-5">
              {detail.data.questions.map((question, index) => {
                const answer = detail.data.answers.find((a) => a.question_id === question.id);
                return (
                  <section key={question.id} className="paper p-6">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="font-display text-xl">
                        Question {questionLabel(question.question_text, index)}
                      </h2>
                      <span className="text-sm text-muted-foreground">{question.marks} marks</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-secondary/60 px-2 py-1">
                        {answer?.awarded_marks ?? 0}/{question.marks} marks (
                        {question.marks > 0
                          ? Math.round(((answer?.awarded_marks ?? 0) / question.marks) * 100)
                          : 0}
                        %)
                      </span>
                      <span className="rounded-full bg-secondary/60 px-2 py-1">
                        {answer?.attempts ?? 0} attempt
                        {(answer?.attempts ?? 0) === 1 ? "" : "s"}
                      </span>
                      <span className="rounded-full bg-secondary/60 px-2 py-1">
                        {formatDuration(answer?.time_spent_seconds ?? 0)} spent
                      </span>
                      <span className="rounded-full bg-secondary/60 px-2 py-1 capitalize">
                        {answer?.verdict ?? "not attempted"}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap">
                      {questionBody(question.question_text)}
                    </p>
                    {question.imageUrls && question.imageUrls.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {question.imageUrls.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer">
                            <img
                              src={url}
                              alt={`Past-paper page for question ${question.position}`}
                              loading="lazy"
                              className="h-48 rounded-lg border border-border bg-card object-contain"
                            />
                          </a>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-xl border border-border p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Mark scheme
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{question.mark_scheme}</p>
                    </div>

                    {(() => {
                      const thread = (
                        detail.data.messages as Array<{
                          id: string;
                          answer_id: string;
                          role: string;
                          content: string;
                          created_at: string;
                        }>
                      ).filter((m) => m.answer_id === answer?.id);
                      if (thread.length === 0) return null;
                      return (
                        <div className="mt-4 rounded-xl border border-border p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            AI tutor log ({thread.filter((m) => m.role === "student").length}{" "}
                            student question
                            {thread.filter((m) => m.role === "student").length === 1 ? "" : "s"})
                          </p>
                          <div className="mt-2 space-y-2">
                            {thread.map((message) => (
                              <div key={message.id} className="text-sm">
                                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                                  {message.role === "tutor" ? "Tutor" : "Student"}
                                </span>
                                <p className="whitespace-pre-wrap">{message.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="mt-4 rounded-xl bg-secondary/40 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Student answer
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">
                        {answer?.answer_text ?? "No answer yet."}
                      </p>
                      {answer?.imageUrls && answer.imageUrls.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {answer.imageUrls.map((url) => (
                            <a key={url} href={url} target="_blank" rel="noreferrer">
                              <img
                                src={url}
                                alt="Student uploaded working"
                                loading="lazy"
                                className="size-24 rounded-lg border border-border object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}
                      {((answer?.mark_breakdown ?? []) as MarkPoint[]).length > 0 ? (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Mark points
                          </p>
                          {((answer?.mark_breakdown ?? []) as MarkPoint[]).map((point, i) => (
                            <p key={i} className="text-sm">
                              <span className={point.awarded ? "text-primary" : "text-destructive"}>
                                {point.awarded ? "✓" : "✗"}
                              </span>{" "}
                              {point.point}{" "}
                              <span className="text-muted-foreground">
                                ({point.awarded ? point.marks : 0}/{point.marks})
                              </span>
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {answer?.feedback ? (
                        <p className="mt-3 text-sm text-muted-foreground">{answer.feedback}</p>
                      ) : null}
                    </div>

                    {answer ? (
                      <MarkOverride
                        answerId={answer.id}
                        maxMarks={question.marks}
                        current={answer.awarded_marks ?? 0}
                        queryKey={queryKey}
                      />
                    ) : null}
                  </section>
                );
              })}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

function MarkOverride({
  answerId,
  maxMarks,
  current,
  queryKey,
}: {
  answerId: string;
  maxMarks: number;
  current: number;
  queryKey: string[];
}) {
  const queryClient = useQueryClient();
  const override = useServerFn(overrideAnswerMarks);
  const [marks, setMarks] = useState(current);

  const mutation = useMutation({
    mutationFn: () => override({ data: { answerId, awardedMarks: marks } }),
    onSuccess: () => {
      toast.success("Marks updated");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mt-4 flex items-center gap-2">
      <Input
        type="number"
        min={0}
        max={maxMarks}
        value={marks}
        onChange={(event) =>
          setMarks(Math.min(maxMarks, Math.max(0, Number(event.target.value) || 0)))
        }
        className="w-20"
      />
      <span className="text-sm text-muted-foreground">/ {maxMarks}</span>
      <Button variant="secondary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        Override marks
      </Button>
    </div>
  );
}
