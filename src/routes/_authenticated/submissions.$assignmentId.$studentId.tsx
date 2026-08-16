import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getSubmissionDetail, overrideAnswerMarks } from "@/lib/app.functions";

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

            <div className="mt-6 space-y-5">
              {detail.data.questions.map((question, index) => {
                const answer = detail.data.answers.find((a) => a.question_id === question.id);
                return (
                  <section key={question.id} className="paper p-6">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="font-display text-xl">Question {index + 1}</h2>
                      <span className="text-sm text-muted-foreground">{question.marks} marks</span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap">{question.question_text}</p>

                    <div className="mt-4 rounded-xl border border-border p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Mark scheme
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{question.mark_scheme}</p>
                    </div>

                    <div className="mt-4 rounded-xl bg-secondary/40 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Student answer
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">
                        {answer?.answer_text ?? "No answer yet."}
                      </p>
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
