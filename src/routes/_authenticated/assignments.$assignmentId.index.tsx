import { normalisePhotoFiles } from "@/lib/heic";
import { formatDueDate } from "@/lib/datetime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { questionLabel } from "@/lib/question-label";
import type { PhotoMode } from "@/lib/photo-mode";
import { photoAvailability } from "@/lib/photo-mode";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";


import { AppHeader } from "@/components/AppHeader";
import { VocabSheet } from "@/components/assignments/VocabSheet";
import { StudentTutorControls } from "@/components/assignments/StudentTutorControls";
import { useActiveTime } from "@/hooks/use-active-time";
import { useContentProtection } from "@/hooks/use-content-protection";
import { QuestionExperience } from "@/components/assignments/QuestionExperience";
import { PAD_FILE_NAME } from "@/components/assignments/DrawingPad";
import { parseSnipBand } from "@/components/assignments/QuestionSnip";
import {
  HELP_PILL,
  HELP_PILL_DOT,
  HELP_PILL_LABEL,
  TeacherIcon,
} from "@/components/assignments/QuestionHelpDialog";
import { MessageTeacherDialog } from "@/components/messaging/MessageTeacherDialog";
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
      { title: "Assignment · PastPaperHelper.AI" },
      {
        name: "description",
        content: "Answer past-paper questions and get step-by-step coaching.",
      },
      { property: "og:title", content: "Assignment · PastPaperHelper.AI" },
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
  const settings = data?.tutorSettings;
  // Screenshots, snipping and printing are always blocked inside homework;
  // blocking copying of the question wording is the teacher's option.
  const protection = useContentProtection({
    blockCopy: Boolean(settings?.protectQuestions),
    blockCapture: true,
  });
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
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-3xl">{data.assignment.title}</h1>
                <VocabSheet assignmentId={assignmentId} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.assignment.className} · {data.assignment.curriculum}
                {data.assignment.subject ? ` · ${data.assignment.subject}` : ""}
                {data.assignment.dueAt
                  ? ` · due ${formatDueDate(data.assignment.dueAt)}`
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
              {Number(data.submission.penalty_percent ?? 0) > 0 ? (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                  <p className="font-medium">
                    Your teacher has deducted {Number(data.submission.penalty_percent)}% from this
                    homework for copying AI into your answers.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    The deduction stays on your final score for this homework. Write every answer in
                    your own words — each new time this happens adds another deduction.
                  </p>
                </div>
              ) : null}

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
                      "Too many AI-generated or copied answers were detected."}{" "}
                    Speak to your teacher — only they can unlock it and give you another chance.
                  </p>
                </div>
              ) : (data.submission.ai_flag_count ?? 0) > 0 ? (
                <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                  <p className="font-medium">
                    Warning {data.submission.ai_flag_count}: AI-generated or copied answers
                    were rejected.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Answers must be your own words. Passing your class warning limit locks this homework and
                    marks it as a fail until your teacher unlocks it.
                  </p>
                </div>
              ) : null}
            </div>

            {settings?.studentCanChangeLevel ? (
              <StudentTutorControls
                classId={data.assignment.classId}
                level={settings.level}
                onSaved={() => workspace.refetch()}
              />
            ) : null}

            <div
              className={`mt-8 space-y-6 ${protection.protectedClassName} ${
                protection.concealed ? "pointer-events-none blur-lg" : ""
              }`}
            >
              {protection.concealed ? (
                <p className="paper p-4 text-sm text-muted-foreground">
                  Questions are hidden while this tab is not in focus. Screenshots, the snipping
                  tool, printing and pasting are blocked on homework.
                </p>
              ) : null}
              {groupByPage(data.questions).map((group) => (
                <div key={group.key} className="space-y-4">
                  {group.questions.map(({ question, index }) => (
                    <QuestionCard
                      key={question.id}
                      assignmentId={assignmentId}
                      classId={data.assignment.classId}
                      className={data.assignment.className}
                      assignmentTitle={data.assignment.title}
                      index={index}
                      question={question}
                      locked={Boolean(data.submission.locked_at) || data.assignment.pastDue}
                      answer={data.answers.find((a) => a.question_id === question.id) ?? null}
                      messages={data.messages}
                      queryKey={queryKey}
                      keywordTranslation={Boolean(settings?.keywordTranslation)}
                      protectQuestions={Boolean(settings?.protectQuestions)}
                      allowHint={settings?.allowHint !== false}
                      allowSteps={settings?.allowSteps !== false}
                      maxAttempts={settings?.maxAttempts ?? 0}
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
  answerImageUrls?: string[];
  /** The teacher gave the whole class full marks for this question. */
  creditedAll?: boolean;

  photoMode?: PhotoMode;
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
  rejected_at?: string | null;
  rejection_note?: string | null;
};
type Message = { id: string; answer_id: string; role: string; content: string };

/**
 * Groups questions under their past-paper page image(s). Each page image is
 * shown at most once for the whole assignment: a question only starts a new
 * page block when it introduces pages that haven't been shown yet.
 */
/** The snipped picture of this question, when the upload produced one. */
export function snipsFor(question: Question) {
  return (question.imageUrls ?? []).filter((url) => parseSnipBand(url));
}

function groupByPage(questions: Question[]) {
  const groups: Array<{
    key: string;
    questions: Array<{ question: Question; index: number }>;
  }> = [];
  questions.forEach((question, index) => {
    const last = groups[groups.length - 1];
    if (last) {
      last.questions.push({ question, index });
      return;
    }
    groups.push({
      key: `questions-${index}`,
      questions: [{ question, index }],
    });
  });
  return groups;
}



function QuestionCard({
  assignmentId,
  classId,
  className,
  assignmentTitle,
  index,
  question,
  answer,
  messages,
  queryKey,
  locked,
  keywordTranslation,
  protectQuestions,
  allowHint,
  allowSteps,
  maxAttempts,
}: {
  assignmentId: string;
  classId: string;
  className: string;
  assignmentTitle: string;
  index: number;
  question: Question;
  answer: Answer | null;
  messages: Message[];
  queryKey: string[];
  locked: boolean;
  keywordTranslation: boolean;
  protectQuestions: boolean;
  allowHint: boolean;
  allowSteps: boolean;
  maxAttempts: number;
}) {
  const queryClient = useQueryClient();
  const grade = useServerFn(gradeAnswer);
  const tutor = useServerFn(sendTutorMessage);
  const [draft, setDraft] = useState(answer?.answer_text ?? "");
  const [reply, setReply] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  // Local previews so a student can see and unattach each photo before submitting.
  const [photoPreviews, setPhotoPreviews] = useState<{ name: string; url: string }[]>([]);
  useEffect(() => {
    const previews = photos.map((file) => ({ name: file.name, url: URL.createObjectURL(file) }));
    setPhotoPreviews(previews);
    return () => previews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [photos]);
  const { requiresPhoto, photoOnly } = photoAvailability(
    question.question_text,
    question.photoMode ?? "auto",
  );
  const [showPhoto, setShowPhoto] = useState(requiresPhoto);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { secondsRef, reset: resetActiveTime } = useActiveTime(cardRef);


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
          // Keep the pad picture recognisable so it stays inside the pad, not in the photo list.
          const path =
            photo.name === PAD_FILE_NAME
              ? `${userId}/${assignmentId}/${question.id}/${PAD_FILE_NAME}`
              : `${userId}/${assignmentId}/${question.id}/${Date.now()}-${uploaded.length}.${ext}`;
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
    onSuccess: async () => {
      resetActiveTime();
      setPhotos([]);
      await queryClient.refetchQueries({ queryKey, type: "active" });
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
    <div ref={cardRef}>
    <QuestionExperience
      question={question}
      index={index}
      snipUrls={snipsFor(question)}
      draft={draft}
      onDraftChange={setDraft}
      requiresPhoto={requiresPhoto}
      photoOnly={photoOnly}
      showPhoto={showPhoto}
      onShowPhoto={() => setShowPhoto(true)}
      photoCount={photos.length}
      photoUrls={answer?.imageUrls ?? []}
      photoFiles={photoPreviews}
      onRemovePhoto={(name) => setPhotos((prev) => prev.filter((item) => item.name !== name))}
      onPhotosChange={(files) => {
        // iPhone photos arrive as HEIC, which browsers can't show — turn them into JPEGs.
        void normalisePhotoFiles(Array.from(files ?? [])).then((ready) =>
          setPhotos((prev) => [...prev, ...ready].slice(0, 6)),
        );
      }}
      onAddDrawing={(file) =>
        // The pad keeps one picture that is replaced each time it is saved.
        setPhotos((prev) => [...prev.filter((item) => item.name !== file.name), file].slice(0, 6))
      }
      sentBack={
        answer?.rejected_at ? { at: answer.rejected_at, note: answer.rejection_note ?? null } : null
      }
      creditedAll={question.creditedAll ?? false}
      result={
        question.creditedAll
          ? {
              verdict: "correct",
              awardedMarks: question.marks,
              feedback: answer?.feedback ?? "",
            }
          : answer && !answer.rejected_at
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
      keywordTranslation={keywordTranslation}
      allowHint={allowHint}
      allowSteps={allowSteps}
      maxAttempts={maxAttempts}
      assignmentId={assignmentId}
      protectQuestions={protectQuestions}
      markScheme={null}
      markSchemeImageUrls={question.answerImageUrls ?? []}

      headerAction={
        <MessageTeacherDialog
          classId={classId}
          className={className}
          preset={{
            assignmentId,
            questionId: question.id,
            topic: `${assignmentTitle} · Question ${questionLabel(question.question_text, index)}`,
          }}
          trigger={
            <button
              type="button"
              title="Ask the teacher"
              aria-label="Ask the teacher"
              className={`${HELP_PILL} border-primary/50 bg-primary/10 hover:bg-primary/20`}
            >
              <span className={`${HELP_PILL_DOT} bg-primary text-primary-foreground`}>
                <TeacherIcon className="size-3.5" />
              </span>
              <span className={`${HELP_PILL_LABEL} text-foreground`}>
                Ask the teacher
              </span>
            </button>
          }
        />
      }

    />
    </div>
  );
}
