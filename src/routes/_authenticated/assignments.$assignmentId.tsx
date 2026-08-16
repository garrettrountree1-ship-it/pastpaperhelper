import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Camera, CheckCircle2, CircleDashed, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { questionBody, questionLabel } from "@/lib/question-label";

import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
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

type Question = {
  id: string;
  position: number;
  question_text: string;
  marks: number;
  imageUrls?: string[];
};
type Answer = {
  id: string;
  question_id: string;
  answer_text: string;
  image_paths?: string[] | null;
  imageUrls?: string[];
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
  const [photos, setPhotos] = useState<File[]>([]);

  const gradeMutation = useMutation({
    mutationFn: async () => {
      let imagePaths = answer?.image_paths ?? [];
      if (photos.length > 0) {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) throw new Error("Please sign in again.");
        const uploaded: string[] = [];
        for (const photo of photos) {
          const ext = photo.name.split(".").pop() || "jpg";
          const path = `${userId}/${assignmentId}/${question.id}/${Date.now()}-${uploaded.length}.${ext}`;
          const { error } = await supabase.storage
            .from("student-work")
            .upload(path, photo, { contentType: photo.type || "image/jpeg", upsert: true });
          if (error) throw new Error(error.message);
          uploaded.push(path);
        }
        imagePaths = uploaded;
      }
      return grade({
        data: { assignmentId, questionId: question.id, answerText: draft, imagePaths },
      });
    },
    onSuccess: () => {
      setPhotos([]);
      queryClient.invalidateQueries({ queryKey });
    },
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
        <h2 className="font-display text-xl">
          Question {questionLabel(question.question_text, index)}
        </h2>
        <span className="text-sm text-muted-foreground">
          {answer?.awarded_marks ?? 0}/{question.marks} marks
        </span>
      </div>
      <p className="mt-3 whitespace-pre-wrap">{questionBody(question.question_text)}</p>
      {question.imageUrls && question.imageUrls.length > 0 ? (
        <div className="mt-3 space-y-2">
          {question.imageUrls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
              <img
                src={url}
                alt={`Past-paper page for question ${question.position}`}
                loading="lazy"
                className="w-full rounded-lg border border-border bg-card object-contain"
              />
            </a>
          ))}
          <p className="text-xs text-muted-foreground">
            Original past-paper page — tap to open full size.
          </p>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write your answer (or attach a photo of your working below)"
          rows={4}
        />

        <div className="rounded-xl border border-dashed border-border p-3">
          <Label
            htmlFor={`photo-${question.id}`}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Camera className="size-4" />
            Photo of your working or diagram
          </Label>
          <Input
            id={`photo-${question.id}`}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="mt-2"
            onChange={(event) => setPhotos(Array.from(event.target.files ?? []).slice(0, 6))}
          />
          {photos.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {photos.length} photo{photos.length === 1 ? "" : "s"} ready — they&apos;ll be marked
              with your answer.
            </p>
          ) : null}
          {answer?.imageUrls && answer.imageUrls.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {answer.imageUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img
                    src={url}
                    alt="Your uploaded working"
                    loading="lazy"
                    className="size-20 rounded-lg border border-border object-cover"
                  />
                </a>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {answer ? `${answer.attempts} attempt${answer.attempts === 1 ? "" : "s"}` : ""}
          </span>
          <Button
            onClick={() => gradeMutation.mutate()}
            disabled={(!draft.trim() && photos.length === 0) || gradeMutation.isPending}
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
