import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { QuestionExperience } from "@/components/assignments/QuestionExperience";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";
import { isPhotoOnlyQuestion, needsPhotoAnswer } from "@/lib/needs-photo";
import {
  getAssignmentPreview,
  previewGradeAnswer,
  previewTutorMessage,
} from "@/lib/app.functions";


export const Route = createFileRoute("/_authenticated/assignments/$assignmentId/preview")({
  head: () => ({
    meta: [
      { title: "Student view · StepWise" },
      {
        name: "description",
        content: "See a homework assignment exactly as your students will see it.",
      },
      { property: "og:title", content: "Student view · StepWise" },
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
};

/** Signed URLs carry a per-request token, so compare the storage path only. */
function pageKey(url: string) {
  return url.split("?")[0] ?? url;
}

/** Each past-paper page appears once, above the questions it introduces. */
function groupByPage(questions: Question[]) {
  const groups: Array<{ key: string; imageUrls: string[]; questions: Question[] }> = [];
  const shown = new Set<string>();
  questions.forEach((question, index) => {
    const fresh = (question.imageUrls ?? []).filter((url) => !shown.has(pageKey(url)));
    const last = groups[groups.length - 1];
    if (fresh.length === 0 && last) {
      last.questions.push(question);
      return;
    }
    fresh.forEach((url) => shown.add(pageKey(url)));
    groups.push({
      key: fresh.map(pageKey).join("|") || `none-${index}`,
      imageUrls: fresh,
      questions: [question],
    });
  });
  return groups;
}

function PreviewPage() {
  const { assignmentId } = Route.useParams();
  const preview = useQuery({
    queryKey: ["assignment-preview", assignmentId],
    queryFn: () => getAssignmentPreview({ data: { assignmentId } }),
    retry: 2,
  });

  const data = preview.data;
  const totalMarks = data?.questions.reduce((sum, q) => sum + q.marks, 0) ?? 0;

  return (
    <div className="min-h-screen">
      <AppHeader role="teacher" />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {data ? (
          <Link
            to="/classes/$classId"
            params={{ classId: data.assignment.classId }}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to class
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
                <Badge variant="secondary">{data.questions.length} questions</Badge>
                <Badge>{totalMarks} marks</Badge>
              </div>
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

                  {group.questions.map((question) => (
                    <PreviewQuestion
                      key={question.id}
                      assignmentId={assignmentId}
                      question={question}
                    />
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

function PreviewQuestion({
  assignmentId,
  question,
  flags,
  onFlag,
}: {
  assignmentId: string;
  question: Question;
  flags: number;
  onFlag: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const requiresPhoto = needsPhotoAnswer(question.question_text);
  const photoOnly = isPhotoOnlyQuestion(question.question_text);
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
      draft={answer}
      onDraftChange={setAnswer}
      requiresPhoto={requiresPhoto}
      photoOnly={photoOnly}
      showPhoto={showPhoto}
      onShowPhoto={() => setShowPhoto(true)}
      photoCount={photos.length}
      photoUrls={photos}
      onPhotosChange={(files) => void addPhotos(files)}
      result={result ?? null}
      attempts={attempts}
      checking={check.isPending}
      checkError={check.isError ? (check.error as Error).message : undefined}
      onCheck={() => check.mutate()}
      thread={thread}
      reply={reply}
      onReplyChange={setReply}
      tutoring={tutor.isPending}
      tutorError={tutor.isError ? (tutor.error as Error).message : undefined}
      onSend={() => tutor.mutate()}
    />
  );
}

