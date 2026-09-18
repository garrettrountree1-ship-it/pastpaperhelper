import { attemptsAllowed } from "@/lib/multiple-choice";
import { formatDueDate } from "@/lib/datetime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
import { parseSnipBand } from "@/components/assignments/QuestionSnip";
import { useContentProtection } from "@/hooks/use-content-protection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";
import type { PhotoMode } from "@/lib/photo-mode";
import { photoAvailability } from "@/lib/photo-mode";
import {
  getAssignmentPreview,
  previewGradeAnswer,
  previewTutorMessage,
  getStudentHomeworkView,
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
  answerCheckMode?: "final-number" | "full-working" | null;
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
  const [studentId, setStudentId] = useState<string>("class");
  const viewingStudent = studentId !== "class";
  const preview = useQuery({
    queryKey: ["assignment-preview", assignmentId, studentId],
    queryFn: () =>
      getAssignmentPreview({
        data: { assignmentId, studentId: studentId === "class" ? null : studentId },
      }),
    retry: 2,
    staleTime: 30 * 60 * 1000,
    gcTime: 8 * 60 * 60 * 1000,
  });

  const data = preview.data;
  const settings = data?.tutorSettings;
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
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Badge variant="secondary">
                  {viewingStudent
                    ? "Watching this student's work — read only"
                    : "Test view (practise here — nothing is saved)"}
                </Badge>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Viewing</span>
                  <Select value={studentId} onValueChange={setStudentId}>
                    <SelectTrigger className="h-8 w-56 text-xs">
                      <SelectValue placeholder="Test view" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="class">Test view (class default settings)</SelectItem>
                      {(data.students ?? []).map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {settings ? (
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">
                    Tutor: {settings.level} · {settings.language}
                  </Badge>
                  <Badge variant="outline">Hint: {settings.allowHint ? "on" : "off"}</Badge>
                  <Badge variant="outline">
                    Step-by-step: {settings.allowSteps ? "on" : "off"}
                  </Badge>
                  <Badge variant="outline">
                    Tries per question:{" "}
                    {settings.maxAttempts > 0 ? settings.maxAttempts : "unlimited"}
                  </Badge>
                  {settings.examMode ? (
                    <Badge variant="outline">
                      Real paper · hand-ins:{" "}
                      {settings.maxPaperSubmissions > 0
                        ? settings.maxPaperSubmissions
                        : "unlimited"}
                    </Badge>
                  ) : null}
                  {settings.keywordTranslation ? (
                    <Badge variant="outline">Key-word translation on</Badge>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-3">
                <h1 className="text-3xl">{data.assignment.title}</h1>
                <VocabSheet assignmentId={assignmentId} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.assignment.className} · {data.assignment.curriculum}
                {data.assignment.subject ? ` · ${data.assignment.subject}` : ""}
                {data.assignment.dueAt ? ` · due ${formatDueDate(data.assignment.dueAt)}` : ""}
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
              {flags > 0 && !viewingStudent ? (
                <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {flags >= 4
                    ? "Locked: too many AI-generated or copied answers were detected. A student would now need their teacher to unlock this homework."
                    : `Warning ${flags}: AI-generated or copied answers detected in this preview session. Passing the class warning limit locks the homework.`}
                </p>
              ) : null}
            </div>

            {viewingStudent ? (
              <StudentWorkView
                assignmentId={assignmentId}
                studentId={studentId}
                protectedClassName={protection.protectedClassName}
                concealed={protection.concealed}
              />
            ) : (
              <>
                <div
                  className={`mt-8 space-y-6 ${protection.protectedClassName} ${
                    protection.concealed ? "pointer-events-none blur-lg" : ""
                  }`}
                >
                  {protection.concealed ? (
                    <p className="paper p-4 text-sm text-muted-foreground">
                      Questions are blurred while this tab is not in focus — students see exactly
                      this. Screenshot and snipping-tool shortcuts, printing and pasting are blocked
                      too.
                    </p>
                  ) : null}
                  {groupByPage(data.questions).map((group) => (
                    <div key={group.key} className="space-y-4">
                      {group.questions.map((question) => (
                        <PreviewQuestion
                          key={question.id}
                          assignmentId={assignmentId}
                          question={question}
                          flags={flags}
                          keywordTranslation={Boolean(data.tutorSettings?.keywordTranslation)}
                          protectQuestions={Boolean(data.tutorSettings?.protectQuestions)}
                          allowHint={settings?.allowHint !== false}
                          allowSteps={settings?.allowSteps !== false}
                          maxAttempts={attemptsAllowed({
                            multipleChoice: Boolean(
                              (question as { multipleChoice?: boolean }).multipleChoice,
                            ),
                            maxAttempts: settings?.maxAttempts ?? 0,
                            maxChoiceAttempts: settings?.maxChoiceAttempts ?? 0,
                          })}
                          markSchemeRevealed={Boolean(data.assignment.markSchemeRevealed)}
                          revealOnFullMarks={Boolean(data.assignment.revealOnFullMarks)}
                          onFlag={() => setFlags((count) => count + 1)}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                <p className="mt-8 text-center text-xs text-muted-foreground">
                  This is your test view — try any question and the AI marks it exactly as it would
                  for a student, but nothing is saved to grades.
                </p>
              </>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

function PreviewQuestion({
  assignmentId,
  question,
  flags,
  keywordTranslation,
  protectQuestions,
  allowHint,
  allowSteps,
  maxAttempts,
  markSchemeRevealed,
  revealOnFullMarks,
  onFlag,
}: {
  assignmentId: string;
  question: Question;
  flags: number;
  keywordTranslation: boolean;
  protectQuestions: boolean;
  allowHint: boolean;
  allowSteps: boolean;
  maxAttempts: number;
  markSchemeRevealed: boolean;
  revealOnFullMarks: boolean;
  onFlag: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const { requiresPhoto, photoOnly } = photoAvailability(
    question.question_text,
    question.photoMode ?? "auto",
  );
  const padPhoto = useRef<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(requiresPhoto);
  const [photos, setPhotos] = useState<string[]>([]);
  const [reply, setReply] = useState("");
  const [thread, setThread] = useState<Array<{ role: "tutor" | "student"; content: string }>>([]);
  const [attempts, setAttempts] = useState(0);

  const check = useMutation({
    mutationFn: async () => {
      if (!isEnglishOnly(answer)) throw new Error(ENGLISH_ONLY_MESSAGE);
      return previewGradeAnswer({
        data: {
          assignmentId,
          questionId: question.id,
          answerText: answer,
          imageDataUrls: photos,
          padDataUrls: padPhoto.current ? [padPhoto.current] : [],

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
  // Full marks on this question releases this question's answer when the teacher
  // turned that on, exactly as a student would see it.
  const earnedFullMarks = question.marks > 0 && Number(result?.awardedMarks ?? 0) >= question.marks;
  const showAnswer = markSchemeRevealed || (revealOnFullMarks && earnedFullMarks);

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
    setPhotos((prev) => [...prev, ...dataUrls].slice(0, 3));
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
      photoUrls={[]}
      photoFiles={photos
        .filter((url) => url !== padPhoto.current)
        .map((url, photoIndex) => ({ name: `Photo ${photoIndex + 1}`, url }))}
      onRemovePhoto={(name) =>
        setPhotos((prev) => {
          const list = prev.filter((url) => url !== padPhoto.current);
          const target = list[Number(name.replace("Photo ", "")) - 1];
          return prev.filter((url) => url !== target);
        })
      }
      onPhotosChange={(files) => void addPhotos(files)}
      onAddDrawing={(file) => {
        const reader = new FileReader();
        // The pad keeps one picture, replaced each time the working is saved.
        reader.onload = () =>
          setPhotos((prev) => {
            const url = String(reader.result);
            const kept = prev.filter((item) => item !== padPhoto.current);
            padPhoto.current = url;
            return [...kept, url].slice(0, 3);
          });
        reader.readAsDataURL(file);
      }}
      result={result ?? null}
      answerCheckMode={question.answerCheckMode ?? null}
      attempts={attempts}
      checking={check.isPending}
      checkError={check.isError ? (check.error as Error).message : undefined}
      onCheck={() => check.mutate()}
      markSchemeImageUrls={showAnswer ? (question.answerImageUrls ?? []) : []}
      keywordTranslation={keywordTranslation}
      allowHint={allowHint}
      allowSteps={allowSteps}
      maxAttempts={maxAttempts}
      assignmentId={assignmentId}
      protectQuestions={protectQuestions}
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

/**
 * Exactly what one student is looking at right now — their typed answers,
 * photos, marks, feedback and tutor chat — with every control removed so the
 * teacher can read and expand, but never change, the student's work.
 */
function StudentWorkView({
  assignmentId,
  studentId,
  protectedClassName,
  concealed,
}: {
  assignmentId: string;
  studentId: string;
  protectedClassName: string;
  concealed: boolean;
}) {
  const view = useQuery({
    queryKey: ["student-homework-view", assignmentId, studentId],
    queryFn: () => getStudentHomeworkView({ data: { assignmentId, studentId } }),
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  if (view.isPending) return <Skeleton className="mt-8 h-64 w-full" />;
  if (view.isError) {
    return (
      <div className="mt-8 text-center">
        <p className="mb-4 text-muted-foreground">
          We couldn&apos;t load this student&apos;s work. {(view.error as Error).message}
        </p>
        <Button onClick={() => view.refetch()}>Retry</Button>
      </div>
    );
  }
  const data = view.data;
  if (!data) return null;

  const answers = data.answers as Array<{
    id: string;
    question_id: string;
    answer_text: string;
    imageUrls: string[];
    verdict: string | null;
    awarded_marks: number;
    feedback: string | null;
    attempts: number;
    rejected_at: string | null;
    rejection_note: string | null;
  }>;
  const answered = data.questions.filter((question) =>
    answers.some((answer) => answer.question_id === question.id),
  ).length;

  return (
    <>
      <div className="paper mt-6 p-5">
        <p className="font-display text-lg">{data.student.name}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {answered}/{data.questions.length} answered
          </Badge>
          <Badge>
            {Number(data.submission?.awarded_marks ?? 0)}/
            {Number(data.submission?.total_marks ?? 0)} marks
          </Badge>
          {data.submission?.status === "submitted" ? <Badge>Handed in</Badge> : null}
          {data.submission?.locked_at ? <Badge variant="destructive">Locked</Badge> : null}
          {data.assignment.pastDue ? <Badge variant="destructive">Past due</Badge> : null}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          You are watching this homework in progress. Open and close each part to read the work —
          nothing here can be typed, marked or removed.
        </p>
      </div>

      <div
        className={`mt-6 space-y-6 ${protectedClassName} ${
          concealed ? "pointer-events-none blur-lg" : ""
        }`}
      >
        {data.questions.map((question, index) => {
          const answer = answers.find((row) => row.question_id === question.id) ?? null;
          const thread = answer
            ? data.messages.filter((message) => message.answer_id === answer.id)
            : [];
          return (
            <QuestionExperience
              key={question.id}
              readOnly
              question={question}
              index={index}
              snipUrls={(question.imageUrls ?? []).filter((url) => parseSnipBand(url))}
              draft={answer?.answer_text ?? ""}
              onDraftChange={() => {}}
              requiresPhoto={false}
              showPhoto={false}
              onShowPhoto={() => {}}
              photoCount={0}
              photoUrls={answer?.imageUrls ?? []}
              photoFiles={[]}
              onPhotosChange={() => {}}
              sentBack={
                answer?.rejected_at
                  ? { at: answer.rejected_at, note: answer.rejection_note ?? null }
                  : null
              }
              creditedAll={(question as { creditedAll?: boolean }).creditedAll ?? false}
              answerCheckMode={question.answerCheckMode ?? null}
              result={
                (question as { creditedAll?: boolean }).creditedAll
                  ? {
                      verdict: "correct",
                      awardedMarks: Number(question.marks ?? 0),
                      feedback: answer?.feedback ?? "",
                    }
                  : answer && !answer.rejected_at
                    ? {
                        verdict: answer.verdict ?? "incorrect",
                        awardedMarks: Number(answer.awarded_marks ?? 0),
                        feedback: answer.feedback ?? "",
                      }
                    : null
              }
              attempts={Number(answer?.attempts ?? 0)}
              checking={false}
              checkError={undefined}
              onCheck={() => {}}
              thread={thread}
              reply=""
              onReplyChange={() => {}}
              tutoring={false}
              tutorError={undefined}
              onSend={() => {}}
              markSchemeImageUrls={question.answerImageUrls ?? []}
              keywordTranslation={false}
              assignmentId={assignmentId}
            />
          );
        })}
      </div>
    </>
  );
}
