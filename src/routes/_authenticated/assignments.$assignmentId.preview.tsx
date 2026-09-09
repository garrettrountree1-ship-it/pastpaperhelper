import { formatDueDate } from "@/lib/datetime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  HELP_PILL,
  HELP_PILL_DOT,
  HELP_PILL_LABEL,
  TeacherIcon,
} from "@/components/assignments/QuestionHelpDialog";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { VocabSheet } from "@/components/assignments/VocabSheet";
import { QuestionExperience } from "@/components/assignments/QuestionExperience";
import { QuestionRecutDialog } from "@/components/assignments/QuestionRecutDialog";
import { parseSnipBand } from "@/components/assignments/QuestionSnip";
import { useContentProtection } from "@/hooks/use-content-protection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";
import type { PhotoMode } from "@/lib/photo-mode";
import { photoAvailability } from "@/lib/photo-mode";
import {
  getAssignmentPreview,
  insertQuestionAfter,
  previewGradeAnswer,
  previewTutorMessage,
  updateQuestionCrop,
} from "@/lib/app.functions";


export const Route = createFileRoute("/_authenticated/assignments/$assignmentId/preview")({
  head: () => ({
    meta: [
      { title: "Student view · PastPaperHelper.AI" },
      {
        name: "description",
        content: "See a homework assignment exactly as your students will see it.",
      },
      { property: "og:title", content: "Student view · PastPaperHelper.AI" },
      {
        property: "og:description",
        content: "See a homework assignment exactly as your students will see it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PreviewPage,
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
          We couldn&apos;t load this preview. {error.message}
        </p>
        <Button onClick={reset}>Try again</Button>
      </main>
    </div>
  ),
});

type Question = {
  id: string;
  position: number;
  question_text: string;
  marks: number;
  imageUrls?: string[];
  answerImagePaths?: string[];
  answerImageUrls?: string[];
  image_paths?: string[];
  markScheme?: string | null;
  photoMode?: PhotoMode;
};


/** Each past-paper page appears once, above the questions it introduces. */
function groupByPage(questions: Question[]) {
  const groups: Array<{ key: string; questions: Question[] }> = [];
  questions.forEach((question, index) => {
    const last = groups[groups.length - 1];
    if (last) {
      last.questions.push(question);
      return;
    }
    groups.push({
      key: `questions-${index}`,
      questions: [question],
    });
  });
  return groups;
}

function PreviewPage() {
  const { assignmentId } = Route.useParams();
  const [flags, setFlags] = useState(0);
  const preview = useQuery({
    queryKey: ["assignment-preview", assignmentId],
    queryFn: () => getAssignmentPreview({ data: { assignmentId } }),
    retry: 2,
  });


  const data = preview.data;
  // The student view must behave exactly like the student page, deterrents included.
  const protection = useContentProtection({
    blockCopy: Boolean(preview.data?.tutorSettings?.protectQuestions),
    blockCapture: true,
  });
  const totalMarks = data?.questions.reduce((sum, q) => sum + q.marks, 0) ?? 0;

  return (
    <div className="min-h-screen">
      <AppHeader role="teacher" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {data ? (
          <Link
            to="/classes/$classId/homework"
            params={{ classId: data.assignment.classId }}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to homework
          </Link>
        ) : null}

        {preview.isPending ? (
          <Skeleton className="mt-6 h-64 w-full" />
        ) : preview.isError ? (
          <div className="mt-6 text-center">
            <p className="mb-4 text-muted-foreground">
              We couldn&apos;t load this preview. {(preview.error as Error).message}
            </p>
            <Button onClick={() => preview.refetch()}>Retry</Button>
          </div>
        ) : data ? (
          <>
            <div className="paper mt-4 p-5">
              <Badge variant="secondary" className="mb-3">
                Student view (preview — nothing is saved)
              </Badge>
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
                <Badge variant="secondary">{data.questions.length} questions</Badge>
                <Badge>{totalMarks} marks</Badge>
                {data.assignment.markSchemeRevealed ? <Badge>Mark scheme released</Badge> : null}
                {data.assignment.pastDue ? (
                  <Badge variant="destructive">Past due · closed for students</Badge>
                ) : null}
              </div>
              {flags > 0 ? (
                <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {flags >= 4
                    ? "Locked: too many AI-generated or copied answers were detected. A student would now need their teacher to unlock this homework."
                    : `Warning ${flags}: AI-generated or copied answers detected in this preview session. Passing the class warning limit locks the homework.`}
                </p>
              ) : null}
            </div>



            <div
              className={`mt-8 space-y-6 ${protection.protectedClassName} ${
                protection.concealed ? "pointer-events-none blur-lg" : ""
              }`}
            >
              {protection.concealed ? (
                <p className="paper p-4 text-sm text-muted-foreground">
                  Questions are blurred while this tab is not in focus — students see exactly this.
                  Screenshot and snipping-tool shortcuts, printing and pasting are blocked too.
                </p>
              ) : null}
              {groupByPage(data.questions).map((group) => (
                <div key={group.key} className="space-y-4">
                  {group.questions.map((question) => (
                    <AddQuestionRow
                      key={question.id}
                      assignmentId={assignmentId}
                      questionId={question.id}
                    >
                    <PreviewQuestion
                      assignmentId={assignmentId}
                      question={question}
                      flags={flags}
                      keywordTranslation={Boolean(data.tutorSettings?.keywordTranslation)}
                      protectQuestions={Boolean(data.tutorSettings?.protectQuestions)}
                      onFlag={() => setFlags((count) => count + 1)}
                    />
                    </AddQuestionRow>
                  ))}

                </div>
              ))}
            </div>

            <p className="mt-8 text-center text-xs text-muted-foreground">
You can test any question here — the AI marks it exactly as it would for a student, but
              nothing is saved to grades.
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}

/** Wraps a question with a teacher-only "add a question here" control below it. */
function AddQuestionRow({
  assignmentId,
  questionId,
  children,
}: {
  assignmentId: string;
  questionId: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: () => insertQuestionAfter({ data: { questionId } }),
    onSuccess: async (result) => {
      toast.success(`Added question ${result.label} — cut its picture next.`);
      await queryClient.invalidateQueries({ queryKey: ["assignment-preview", assignmentId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div>
      {children}
      <div className="flex justify-center py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          disabled={add.isPending}
          onClick={() => add.mutate()}
        >
          <Plus className="size-3" />
          {add.isPending ? "Adding..." : "Add a question here"}
        </Button>
      </div>
    </div>
  );
}

function PreviewQuestion({
  assignmentId,
  question,
  flags,
  keywordTranslation,
  protectQuestions,
  onFlag,
}: {
  assignmentId: string;
  question: Question;
  flags: number;
  keywordTranslation: boolean;
  protectQuestions: boolean;
  onFlag: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const { requiresPhoto, photoOnly } = photoAvailability(
    question.question_text,
    question.photoMode ?? "auto",
  );
  const [showPhoto, setShowPhoto] = useState(requiresPhoto);
  const [photos, setPhotos] = useState<string[]>([]);
  const [reply, setReply] = useState("");
  const [thread, setThread] = useState<Array<{ role: "tutor" | "student"; content: string }>>([]);
  const [attempts, setAttempts] = useState(0);
  const queryClient = useQueryClient();
  const saveCrop = useMutation({
    mutationFn: ({
      imagePaths,
      target,
    }: {
      imagePaths: string[];
      imageUrls: string[];
      target?: "question" | "answer";
    }) => updateQuestionCrop({ data: { questionId: question.id, imagePaths, target: target ?? "question" } }),
    onSuccess: async () => {
      toast.success("Question crop saved");
      await queryClient.invalidateQueries({ queryKey: ["assignment-preview", assignmentId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const check = useMutation({
    mutationFn: async () => {
      if (!isEnglishOnly(answer)) throw new Error(ENGLISH_ONLY_MESSAGE);
      return previewGradeAnswer({
        data: {
          assignmentId,
          questionId: question.id,
          answerText: answer,
          imageDataUrls: photos,
          priorFlags: flags,
        },
      });
    },
    onError: (error: Error) => {
      if (/AI-generated or copied|locked/i.test(error.message)) onFlag();
    },
    onSuccess: (result) => {
      setAttempts((count) => count + 1);
      const opener = result.leadingQuestion;
      setThread(opener ? [{ role: "tutor", content: opener }] : []);
    },
  });

  const result = check.data;

  const tutor = useMutation({
    mutationFn: async () => {
      if (!isEnglishOnly(reply)) throw new Error("Please ask your question in English.");
      const history = thread;
      const message = reply;
      const res = await previewTutorMessage({
        data: {
          assignmentId,
          questionId: question.id,
          studentAnswer: answer,
          message,
          history,
          awardedMarks: check.data?.awardedMarks,
          markBreakdown: check.data?.markBreakdown ?? undefined,
        },
      });
      return { message, reply: res.reply };
    },
    onSuccess: ({ message, reply: tutorReply }) => {
      setThread((prev) => [
        ...prev,
        { role: "student", content: message },
        { role: "tutor", content: tutorReply },
      ]);
      setReply("");
    },
  });

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, 3);
    const dataUrls = await Promise.all(
      picked.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Couldn't read that image."));
            reader.readAsDataURL(file);
          }),
      ),
    );
    setPhotos(dataUrls);
  }

  return (
    <QuestionExperience
      question={question}
      index={question.position}
      snipUrls={(question.imageUrls ?? []).filter((url) => parseSnipBand(url))}
      draft={answer}
      onDraftChange={setAnswer}
      requiresPhoto={requiresPhoto}
      photoOnly={photoOnly}
      showPhoto={showPhoto}
      onShowPhoto={() => setShowPhoto(true)}
      photoCount={photos.length}
      photoUrls={photos}
      onPhotosChange={(files) => void addPhotos(files)}
      onAddDrawing={(file) => {
        const reader = new FileReader();
        reader.onload = () =>
          setPhotos((prev) => [...prev, String(reader.result)].slice(0, 3));
        reader.readAsDataURL(file);
      }}
      result={result ?? null}
      attempts={attempts}
      checking={check.isPending}
      checkError={check.isError ? (check.error as Error).message : undefined}
      onCheck={() => check.mutate()}
      markScheme={question.markScheme ?? null}
      markSchemeImageUrls={question.answerImageUrls ?? []}
      keywordTranslation={keywordTranslation}
      assignmentId={assignmentId}
      protectQuestions={protectQuestions}
      snipAction={
        (question.image_paths ?? []).length > 0 && (question.imageUrls ?? []).length > 0 ? (
          <QuestionRecutDialog
            imagePaths={question.image_paths ?? []}
            imageUrls={question.imageUrls ?? []}
            saving={saveCrop.isPending}
            onSave={async (imagePaths) => {
              await saveCrop.mutateAsync({ imagePaths, imageUrls: [] });
            }}
          />
        ) : null
      }
      answerAction={
        (question.answerImagePaths ?? []).length > 0 && (question.answerImageUrls ?? []).length > 0 ? (
          <QuestionRecutDialog
            label="Recut answer"
            imagePaths={question.answerImagePaths ?? []}
            imageUrls={question.answerImageUrls ?? []}
            saving={saveCrop.isPending}
            onSave={async (imagePaths) => {
              await saveCrop.mutateAsync({ imagePaths, imageUrls: [], target: "answer" });
            }}
          />
        ) : null
      }
      headerAction={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Ask the teacher"
            aria-label="Ask the teacher"
            onClick={() =>
              toast.info(
                "Students use this button to message you about this exact question — their message, with the question reference, lands in your class mailbox under Bulletin & Messages.",
              )
            }
            className={`${HELP_PILL} border-primary/50 bg-primary/10 hover:bg-primary/20`}
          >
            <span className={`${HELP_PILL_DOT} bg-primary text-primary-foreground`}>
              <TeacherIcon className="size-3.5" />
            </span>
            <span className={`${HELP_PILL_LABEL} text-foreground`}>Ask the teacher</span>
          </Button>
        </div>
      }
      thread={thread}
      reply={reply}
      onReplyChange={setReply}
      tutoring={tutor.isPending}
      tutorError={tutor.isError ? (tutor.error as Error).message : undefined}
      onSend={() => tutor.mutate()}
    />
  );
}

