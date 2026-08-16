import { Camera, CheckCircle2, CircleDashed, Sparkles, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";
import { questionBody, questionLabel } from "@/lib/question-label";

type TutorTurn = { id?: string; role: string; content: string };
type Result = {
  verdict: string;
  awardedMarks: number;
  feedback: string;
};

export function QuestionExperience({
  question,
  index,
  draft,
  onDraftChange,
  requiresPhoto,
  showPhoto,
  onShowPhoto,
  photoCount,
  photoUrls = [],
  onPhotosChange,
  result,
  attempts,
  checking,
  checkError,
  onCheck,
  thread,
  reply,
  onReplyChange,
  tutoring,
  tutorError,
  onSend,
}: {
  question: { id: string; question_text: string; marks: number };
  index: number;
  draft: string;
  onDraftChange: (value: string) => void;
  requiresPhoto: boolean;
  showPhoto: boolean;
  onShowPhoto: () => void;
  photoCount: number;
  photoUrls?: string[];
  onPhotosChange: (files: FileList | null) => void;
  result: Result | null;
  attempts: number;
  checking: boolean;
  checkError?: string;
  onCheck: () => void;
  thread: TutorTurn[];
  reply: string;
  onReplyChange: (value: string) => void;
  tutoring: boolean;
  tutorError?: string;
  onSend: () => void;
}) {
  const verdict = result?.verdict ?? null;

  return (
    <section className="paper p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-xl">
          Question {questionLabel(question.question_text, index)}
        </h2>
        <Badge variant="secondary">
          {result ? `${result.awardedMarks}/` : ""}{question.marks} marks
        </Badge>
      </div>
      <p className="mt-3 whitespace-pre-wrap">{questionBody(question.question_text)}</p>

      <div className="mt-4 space-y-3">
        <Textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={
            requiresPhoto
              ? "Describe what you drew (and upload a photo of it below)"
              : "Write your answer in English"
          }
          rows={4}
        />
        {draft && !isEnglishOnly(draft) ? (
          <p className="text-sm text-destructive">{ENGLISH_ONLY_MESSAGE}</p>
        ) : null}

        {showPhoto ? (
          <div className="rounded-lg border border-dashed border-border p-3">
            <Label
              htmlFor={`photo-${question.id}`}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <Camera className="size-4" />
              Photo of your working or diagram
              {requiresPhoto ? <Badge variant="secondary">needed here</Badge> : null}
            </Label>
            <Input
              id={`photo-${question.id}`}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="mt-2"
              onChange={(event) => onPhotosChange(event.target.files)}
            />
            {photoCount > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {photoCount} photo{photoCount === 1 ? "" : "s"} ready — they&apos;ll be marked
                with your answer.
              </p>
            ) : null}
            {photoUrls.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {photoUrls.map((url, photoIndex) => (
                  <img
                    key={`${photoIndex}-${url.slice(-12)}`}
                    src={url}
                    alt="Uploaded working"
                    loading="lazy"
                    className="size-20 rounded-lg border border-border object-cover"
                  />
                ))}
              </div>
            ) : null}
            {requiresPhoto ? (
              <p className="mt-2 text-xs text-muted-foreground">
                This question asks you to draw, circle or plot — upload a photo of your work so it
                can be marked.
              </p>
            ) : null}
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={onShowPhoto}
          >
            <Camera className="mr-2 size-4" />
            Add a photo of your working or diagram
          </Button>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {attempts > 0 ? `${attempts} attempt${attempts === 1 ? "" : "s"}` : ""}
          </span>
          <Button
            onClick={onCheck}
            disabled={(!draft.trim() && photoCount === 0) || checking || !isEnglishOnly(draft)}
          >
            {checking ? "Marking..." : result ? "Re-check answer" : "Check answer"}
          </Button>
        </div>
        {checkError ? <p className="text-sm text-destructive">{checkError}</p> : null}
      </div>

      {result ? (
        <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-4">
          <div className="flex items-center gap-2">
            {verdict === "correct" ? (
              <CheckCircle2 className="size-5 text-primary" />
            ) : verdict === "partial" ? (
              <CircleDashed className="size-5 text-accent-foreground" />
            ) : (
              <XCircle className="size-5 text-destructive" />
            )}
            <span className="font-display text-lg">
              {verdict === "partial" ? "Partly right" : verdict === "correct" ? "Correct" : "Not yet"}
            </span>
          </div>
          {result.feedback ? (
            <p className="mt-2 whitespace-pre-wrap text-sm">{result.feedback}</p>
          ) : null}
          {verdict !== "correct" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Edit your answer above and press “Re-check answer” to try again.
            </p>
          ) : null}

          {thread.length > 0 ? (
            <div className="mt-4 space-y-3">
              {thread.map((message, messageIndex) => (
                <div
                  key={message.id ?? `${message.role}-${messageIndex}`}
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

          <div className="mt-4 space-y-2">
            <Label htmlFor={`ask-${question.id}`} className="text-xs uppercase tracking-wide text-muted-foreground">
              Ask the AI tutor
            </Label>
            <div className="flex items-end gap-2">
              <Textarea
                id={`ask-${question.id}`}
                value={reply}
                onChange={(event) => onReplyChange(event.target.value)}
                placeholder="Reply to the tutor, or ask a follow-up question — as many as you need"
                rows={2}
              />
              <Button
                variant="secondary"
                onClick={onSend}
                disabled={!reply.trim() || tutoring || !isEnglishOnly(reply)}
              >
                {tutoring ? "Thinking..." : "Send"}
              </Button>
            </div>
            {reply && !isEnglishOnly(reply) ? (
              <p className="text-sm text-destructive">Please ask your question in English.</p>
            ) : null}
            {tutorError ? <p className="text-sm text-destructive">{tutorError}</p> : null}
            <p className="text-xs text-muted-foreground">
              The tutor never gives the answer, and your teacher can see these questions.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}