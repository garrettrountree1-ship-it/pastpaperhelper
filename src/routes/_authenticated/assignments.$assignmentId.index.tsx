import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isPhotoOnlyQuestion, needsPhotoAnswer } from "@/lib/needs-photo";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";


import { AppHeader } from "@/components/AppHeader";
import { QuestionExperience } from "@/components/assignments/QuestionExperience";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  gradeAnswer,
  getAssignmentWorkspace,
  sendTutorMessage,
  submitAssignment,
} from "@/lib/app.functions";

export const Route = createFileRoute("/_authenticated/assignments/$assignmentId/")({
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
            <div className="paper mt-4 p-5">
              <h1 className="text-3xl">{data.assignment.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.assignment.className} · {data.assignment.curriculum}
                {data.assignment.subject ? ` · ${data.assignment.subject}` : ""}
                {data.assignment.dueAt
                  ? ` · due ${new Date(data.assignment.dueAt).toLocaleString()}`
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
                {data.submission.locked_at ? <Badge variant="destructive">Locked · fail</Badge> : null}
              </div>
              {data.assignment.pastDue ? (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                  <p className="font-medium">The due date has passed — this homework is closed.</p>
                  <p className="mt-1 text-muted-foreground">
                    You can still read your answers and feedback. Ask your teacher if you need the
                    due date extended.
                  </p>
                </div>
              ) : null}
              {data.assignment.markSchemeRevealed ? (
                <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                  <p className="font-medium">Your teacher has released the mark scheme.</p>
                  <p className="mt-1 text-muted-foreground">
                    Each question below now shows the official marking points.
                  </p>
                </div>
              ) : null}
              {data.submission.locked_at ? (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                  <p className="font-medium">This homework is locked and marked as a fail.</p>
                  <p className="mt-1 text-muted-foreground">
                    {data.submission.locked_reason ??
                      "A fourth AI-generated or copied answer was detected."}{" "}
                    Speak to your teacher — only they can unlock it and give you another chance.
                  </p>
                </div>
              ) : (data.submission.ai_flag_count ?? 0) > 0 ? (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                  <p className="font-medium">
                    Warning {data.submission.ai_flag_count} of 3: AI-generated or copied answers
                    were rejected.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Answers must be your own words. A fourth AI answer locks this homework and
                    marks it as a fail until your teacher unlocks it.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-8 space-y-6">
              {groupByPage(data.questions).map((group) => (
                <div key={group.key} className="space-y-4">
                  {group.imageUrls.length > 0 ? (
                    <div className="paper space-y-2 p-4">
                      {group.imageUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                          <img
                            src={url}
                            alt="Past-paper page for the questions below"
                            loading="lazy"
                            className="w-full rounded-lg border border-border bg-card object-contain"
                          />
                        </a>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        Original past-paper page — tap to open full size. The questions below are
                        from this page.
                      </p>
                    </div>
                  ) : null}
                  {group.questions.map(({ question, index }) => (
                    <QuestionCard
                      key={question.id}
                      assignmentId={assignmentId}
                      index={index}
                      question={question}
                      locked={Boolean(data.submission.locked_at) || data.assignment.pastDue}
                      answer={data.answers.find((a) => a.question_id === question.id) ?? null}
                      messages={data.messages}
                      queryKey={queryKey}
                    />
                  ))}
                </div>
              ))}
            </div>


            <div className="mt-8 flex justify-end">
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={
                  data.assignment.pastDue ||
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
  markScheme?: string | null;
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

/**
 * Groups questions under their past-paper page image(s). Each page image is
 * shown at most once for the whole assignment: a question only starts a new
 * page block when it introduces pages that haven't been shown yet.
 */
function pageKey(url: string) {
  // Signed URLs carry a per-request token, so compare the storage path only.
  return url.split("?")[0] ?? url;
}

function groupByPage(questions: Question[]) {
  const groups: Array<{
    key: string;
    imageUrls: string[];
    questions: Array<{ question: Question; index: number }>;
  }> = [];
  const shown = new Set<string>();
  questions.forEach((question, index) => {
    const fresh = (question.imageUrls ?? []).filter((url) => !shown.has(pageKey(url)));
    const last = groups[groups.length - 1];
    if (fresh.length === 0 && last) {
      last.questions.push({ question, index });
      return;
    }
    fresh.forEach((url) => shown.add(pageKey(url)));
    groups.push({
      key: fresh.map(pageKey).join("|") || `none-${index}`,
      imageUrls: fresh,
      questions: [{ question, index }],
    });
  });
  return groups;
}


function QuestionCard({
  assignmentId,
  index,
  question,
  answer,
  messages,
  queryKey,
  locked,
}: {
  assignmentId: string;
  index: number;
  question: Question;
  answer: Answer | null;
  messages: Message[];
  queryKey: string[];
  locked: boolean;
}) {
  const queryClient = useQueryClient();
  const grade = useServerFn(gradeAnswer);
  const tutor = useServerFn(sendTutorMessage);
  const [draft, setDraft] = useState(answer?.answer_text ?? "");
  const [reply, setReply] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const requiresPhoto = needsPhotoAnswer(question.question_text);
  const photoOnly = isPhotoOnlyQuestion(question.question_text);
  const [showPhoto, setShowPhoto] = useState(requiresPhoto);
  const secondsRef = useRef(0);

  useEffect(() => {
    const tick = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        secondsRef.current += 1;
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const gradeMutation = useMutation({
    mutationFn: async () => {
      if (!isEnglishOnly(draft)) throw new Error(ENGLISH_ONLY_MESSAGE);
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
        data: {
          assignmentId,
          questionId: question.id,
          answerText: draft,
          imagePaths,
          timeSpentSeconds: secondsRef.current,
        },
      });
    },
    onSuccess: () => {
      secondsRef.current = 0;
      setPhotos([]);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      // Integrity strikes / locking change server state even on rejection.
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const tutorMutation = useMutation({
    mutationFn: async () => {
      if (!isEnglishOnly(reply)) throw new Error("Please ask your question in English.");
      return tutor({ data: { answerId: answer!.id, message: reply } });
    },

    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const thread = answer ? messages.filter((m) => m.answer_id === answer.id) : [];
  return (
    <QuestionExperience
      question={question}
      index={index}
      draft={draft}
      onDraftChange={setDraft}
      requiresPhoto={requiresPhoto}
      photoOnly={photoOnly}
      showPhoto={showPhoto}
      onShowPhoto={() => setShowPhoto(true)}
      photoCount={photos.length}
      photoUrls={answer?.imageUrls ?? []}
      onPhotosChange={(files) => setPhotos(Array.from(files ?? []).slice(0, 6))}
      onAddDrawing={(file) => setPhotos((prev) => [...prev, file].slice(0, 6))}
      result={
        answer
          ? {
              verdict: answer.verdict ?? "incorrect",
              awardedMarks: answer.awarded_marks ?? 0,
              feedback: answer.feedback ?? "",
            }
          : null
      }
      attempts={answer?.attempts ?? 0}
      checking={gradeMutation.isPending}
      checkError={gradeMutation.isError ? (gradeMutation.error as Error).message : undefined}
      onCheck={() => gradeMutation.mutate()}
      thread={thread}
      reply={reply}
      onReplyChange={setReply}
      tutoring={tutorMutation.isPending}
      tutorError={tutorMutation.isError ? (tutorMutation.error as Error).message : undefined}
      onSend={() => tutorMutation.mutate()}
      locked={locked}
      markScheme={question.markScheme ?? null}

    />
  );
}
