import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Camera, CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";
import { needsPhotoAnswer } from "@/lib/needs-photo";
import {
  getAssignmentPreview,
  previewGradeAnswer,
  previewTutorMessage,
} from "@/lib/app.functions";
import { questionBody, questionLabel } from "@/lib/question-label";


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

/** Each past-paper page appears once, above the questions it introduces. */
function groupByPage(questions: Question[]) {
  const groups: Array<{ key: string; imageUrls: string[]; questions: Question[] }> = [];
  const shown = new Set<string>();
  questions.forEach((question, index) => {
    const fresh = (question.imageUrls ?? []).filter((url) => !shown.has(url));
    const last = groups[groups.length - 1];
    if (fresh.length === 0 && last) {
      last.questions.push(question);
      return;
    }
    fresh.forEach((url) => shown.add(url));
    groups.push({ key: fresh.join("|") || `none-${index}`, imageUrls: fresh, questions: [question] });
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
            <div className="mt-4">
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
}: {
  assignmentId: string;
  question: Question;
}) {
  const [answer, setAnswer] = useState("");
  const requiresPhoto = needsPhotoAnswer(question.question_text);
  const [showPhoto, setShowPhoto] = useState(requiresPhoto);
  const [photos, setPhotos] = useState<string[]>([]);
  const [reply, setReply] = useState("");
  const [thread, setThread] = useState<Array<{ role: "tutor" | "student"; content: string }>>([]);

  const check = useMutation({
    mutationFn: async () => {
      if (!isEnglishOnly(answer)) throw new Error(ENGLISH_ONLY_MESSAGE);
      return previewGradeAnswer({
        data: {
          assignmentId,
          questionId: question.id,
          answerText: answer,
          imageDataUrls: photos,
        },
      });
    },
    onSuccess: (result) => {
      const opener = [result.explanation, result.leadingQuestion].filter(Boolean).join("\n\n");
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
    <div className="paper p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg">{questionLabel(question.question_text, question.position)}</h2>
        <Badge variant="secondary">{question.marks} marks</Badge>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{questionBody(question.question_text)}</p>
      <Textarea
        className="mt-4"
        rows={3}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder={
          requiresPhoto
            ? "Describe what you drew (and attach a photo below)"
            : "Type a test answer in English…"
        }
      />
      {answer && !isEnglishOnly(answer) ? (
        <p className="mt-2 text-sm text-destructive">{ENGLISH_ONLY_MESSAGE}</p>
      ) : null}

      {showPhoto ? (
        <div className="mt-3 rounded-xl border border-dashed border-border p-3">
          <Label
            htmlFor={`preview-photo-${question.id}`}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Camera className="size-4" />
            Photo of working or diagram
            {requiresPhoto ? <Badge variant="secondary">needed here</Badge> : null}
          </Label>
          <Input
            id={`preview-photo-${question.id}`}
            type="file"
            accept="image/*"
            multiple
            className="mt-2"
            onChange={(event) => void addPhotos(event.target.files)}
          />
          {photos.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map((src, index) => (
                <img
                  key={`${index}-${src.slice(-12)}`}
                  src={src}
                  alt="Attached working"
                  className="h-20 rounded-md border border-border object-cover"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => setShowPhoto(true)}
        >
          <Camera className="mr-2 h-4 w-4" />
          Add a photo
        </Button>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => check.mutate()}
          disabled={check.isPending || (!answer.trim() && photos.length === 0)}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {check.isPending ? "Marking…" : result ? "Re-check answer" : "Check answer"}
        </Button>
        {result || check.isError ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              check.reset();
              setThread([]);
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {check.isError ? (
        <p className="mt-3 text-sm text-destructive">{(check.error as Error).message}</p>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            {result.verdict === "correct" ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            <span>
              {result.awardedMarks} / {result.totalMarks} marks · {result.verdict}
            </span>
          </div>
          {result.markPoints.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {result.markPoints.map((point, index) => (
                <li key={`${point.point}-${index}`}>
                  {point.awarded ? "✓" : "✗"} {point.point} ({point.marks})
                </li>
              ))}
            </ul>
          ) : null}
          {result.feedback ? (
            <p className="mt-3 whitespace-pre-wrap text-sm">{result.feedback}</p>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3">
          {thread.map((turn, index) => (
            <div
              key={`${turn.role}-${index}`}
              className={
                turn.role === "tutor"
                  ? "rounded-lg border border-border bg-card p-3 text-sm"
                  : "rounded-lg bg-primary/10 p-3 text-sm"
              }
            >
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {turn.role === "tutor" ? "AI tutor" : "Student"}
              </p>
              <p className="whitespace-pre-wrap">{turn.content}</p>
            </div>
          ))}

          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Ask the AI tutor a follow-up question (in English)…"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => tutor.mutate()}
              disabled={tutor.isPending || !reply.trim()}
            >
              {tutor.isPending ? "…" : "Ask"}
            </Button>
          </div>
          {tutor.isError ? (
            <p className="text-sm text-destructive">{(tutor.error as Error).message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

