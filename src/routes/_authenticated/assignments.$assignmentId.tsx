import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleDashed, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  gradeAnswer,
  getAssignmentWorkspace,
  sendTutorMessage,
  submitAssignment,
} from "@/lib/app.functions";

export const Route = createFileRoute("/_authenticated/assignments/$assignmentId")({
  head: () => ({
    meta: [
      { title: "Assignment · StepWise" },
      {
        name: "description",
        content: "Answer past-paper questions and get step-by-step coaching.",
      },
      { property: "og:title", content: "Assignment · StepWise" },
      {
        property: "og:description",
        content: "Answer past-paper questions and get step-by-step coaching.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssignmentPage,
  pendingComponent: () => (
    <div className="min-h-screen">
      <AppHeader role="student" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-64 w-full" />
      </main>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen">
      <AppHeader role="student" />
      <main className="mx-auto max-w-3xl px-4 py-8 text-center">
        <p className="mb-4 text-muted-foreground">
          We couldn&apos;t load this homework. {error.message}
        </p>
        <Button onClick={reset}>Try again</Button>
      </main>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Assignment not found.</div>,
});

function AssignmentPage() {
  const { assignmentId } = Route.useParams();
  const queryClient = useQueryClient();
  const queryKey = ["workspace", assignmentId];
  const workspace = useQuery({
    queryKey,
    queryFn: () => getAssignmentWorkspace({ data: { assignmentId } }),
    retry: 2,
  });

  const submit = useServerFn(submitAssignment);

  const submitMutation = useMutation({
    mutationFn: () => submit({ data: { assignmentId } }),
    onSuccess: () => {
      toast.success("Homework submitted");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = workspace.data;
  const answered = data
    ? data.questions.filter((q) => data.answers.some((a) => a.question_id === q.id)).length
    : 0;

  return (
    <div className="min-h-screen">
      <AppHeader role="student" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Your homework
        </Link>

        {workspace.isPending ? (
          <Skeleton className="mt-6 h-64 w-full" />
        ) : workspace.isError ? (
          <div className="mt-6 text-center">
            <p className="mb-4 text-muted-foreground">
              We couldn&apos;t load this homework. {(workspace.error as Error).message}
            </p>
            <Button onClick={() => workspace.refetch()}>Retry</Button>
          </div>
        ) : data ? (
          <>
            <div className="mt-4">
              <h1 className="text-3xl">{data.assignment.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.assignment.className} · {data.assignment.curriculum}
                {data.assignment.subject ? ` · ${data.assignment.subject}` : ""}
                {data.assignment.dueAt
                  ? ` · due ${new Date(data.assignment.dueAt).toLocaleDateString()}`
                  : ""}
              </p>
              {data.assignment.instructions ? (
                <p className="mt-3 text-sm">{data.assignment.instructions}</p>
              ) : null}
              <div className="mt-4 flex items-center gap-3">
                <Badge variant="secondary">
                  {answered}/{data.questions.length} answered
                </Badge>
                <Badge>
                  {data.submission.awarded_marks ?? 0}/{data.submission.total_marks} marks
                </Badge>
                {data.submission.status === "submitted" ? <Badge>Submitted</Badge> : null}
              </div>
            </div>

            <div className="mt-8 space-y-6">
              {data.questions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  assignmentId={assignmentId}
                  index={index}
                  question={question}
                  answer={data.answers.find((a) => a.question_id === question.id) ?? null}
                  messages={data.messages}
                  queryKey={queryKey}
                />
              ))}
            </div>

            <div className="mt-8 flex justify-end">
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={
                  answered < data.questions.length ||
                  data.submission.status === "submitted" ||
                  submitMutation.isPending
                }
              >
                {data.submission.status === "submitted" ? "Submitted" : "Submit homework"}
              </Button>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

type Question = { id: string; position: number; question_text: string; marks: number };
type Answer = {
  id: string;
  question_id: string;
  answer_text: string;
  verdict: string | null;
  awarded_marks: number | null;
  feedback: string | null;
  attempts: number;
  resolved: boolean;
};
type Message = { id: string; answer_id: string; role: string; content: string };

function QuestionCard({
  assignmentId,
  index,
  question,
  answer,
  messages,
  queryKey,
}: {
  assignmentId: string;
  index: number;
  question: Question;
  answer: Answer | null;
  messages: Message[];
  queryKey: string[];
}) {
  const queryClient = useQueryClient();
  const grade = useServerFn(gradeAnswer);
  const tutor = useServerFn(sendTutorMessage);
  const [draft, setDraft] = useState(answer?.answer_text ?? "");
  const [reply, setReply] = useState("");

  const gradeMutation = useMutation({
    mutationFn: () =>
      grade({ data: { assignmentId, questionId: question.id, answerText: draft } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) => toast.error(error.message),
  });

  const tutorMutation = useMutation({
    mutationFn: () => tutor({ data: { answerId: answer!.id, message: reply } }),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const thread = answer ? messages.filter((m) => m.answer_id === answer.id) : [];
  const verdict = answer?.verdict ?? null;

  return (
    <section className="paper p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-xl">Question {index + 1}</h2>
        <span className="text-sm text-muted-foreground">
          {answer?.awarded_marks ?? 0}/{question.marks} marks
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap">{question.question_text}</p>

      <div className="mt-4 space-y-3">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write your answer"
          rows={4}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {answer ? `${answer.attempts} attempt${answer.attempts === 1 ? "" : "s"}` : ""}
          </span>
          <Button
            onClick={() => gradeMutation.mutate()}
            disabled={!draft.trim() || gradeMutation.isPending}
          >
            {gradeMutation.isPending ? "Marking..." : answer ? "Re-check answer" : "Check answer"}
          </Button>
        </div>
      </div>

      {answer ? (
        <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-center gap-2">
            {verdict === "correct" ? (
              <CheckCircle2 className="size-5 text-primary" />
            ) : verdict === "partial" ? (
              <CircleDashed className="size-5 text-accent-foreground" />
            ) : (
              <XCircle className="size-5 text-destructive" />
            )}
            <span className="font-display text-lg capitalize">
              {verdict === "partial" ? "Partly right" : verdict === "correct" ? "Correct" : "Not yet"}
            </span>
          </div>
          {answer.feedback ? <p className="mt-2 text-sm">{answer.feedback}</p> : null}

          {thread.length > 0 ? (
            <div className="mt-4 space-y-3">
              {thread.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "tutor"
                      ? "rounded-lg bg-background p-3 text-sm"
                      : "rounded-lg bg-primary/10 p-3 text-sm"
                  }
                >
                  <p className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {message.role === "tutor" ? <Sparkles className="size-3" /> : null}
                    {message.role === "tutor" ? "Tutor" : "You"}
                  </p>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              ))}
            </div>
          ) : null}

          {verdict !== "correct" ? (
            <div className="mt-4 flex items-end gap-2">
              <Textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Reply to the tutor's question"
                rows={2}
              />
              <Button
                variant="secondary"
                onClick={() => tutorMutation.mutate()}
                disabled={!reply.trim() || tutorMutation.isPending}
              >
                {tutorMutation.isPending ? "Thinking..." : "Send"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
