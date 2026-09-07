import { useQuery } from "@tanstack/react-query";
import { Camera, CheckCircle2, CircleDashed, Sparkles, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { GlossaryText } from "@/components/assignments/GlossaryText";
import { cleanMathText } from "@/lib/math-text";
import { cleanTutorText, TutorText } from "@/lib/tutor-text";
import { getQuestionGlossary, getTutorGlossary } from "@/lib/tutor-settings.functions";

import { CameraCapture } from "@/components/assignments/CameraCapture";
import { DrawingPad } from "@/components/assignments/DrawingPad";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bulletTargetFor, normaliseBullets, stripBullets } from "@/lib/bullet-scaffold";
import { NO_PASTE_MESSAGE } from "@/lib/integrity";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";
import { questionBody, questionLabel } from "@/lib/question-label";


/** Blocks paste, drag-drop and autofill-style bulk insertion into answer inputs. */
function useOriginalTypingGuard() {
  const [flagged, setFlagged] = useState(false);
  const reject = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setFlagged(true);
    toast.error(NO_PASTE_MESSAGE);
  };
  return {
    flagged,
    clearFlag: () => setFlagged(false),
    guardProps: {
      onPaste: reject,
      onDrop: reject,
      onBeforeInput: (event: React.FormEvent<HTMLTextAreaElement>) => {
        const native = event.nativeEvent as InputEvent;
        if (
          native.inputType?.startsWith("insertFromPaste") ||
          native.inputType === "insertFromDrop" ||
          (native.inputType === "insertReplacementText" && (native.data ?? "").length > 30)
        ) {
          reject(event);
        }
      },
    },
  };
}


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
  photoOnly = false,
  showPhoto,
  onShowPhoto,
  photoCount,
  photoUrls = [],
  onPhotosChange,
  onAddDrawing,
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
  locked = false,
  markScheme = null,
  headerAction = null,
  keywordTranslation = false,
  
  assignmentId,
  sentBack = null,


}: {
  question: { id: string; question_text: string; marks: number };
  index: number;
  draft: string;
  onDraftChange: (value: string) => void;
  requiresPhoto: boolean;
  /** Calculation question — worked on paper, marked from the photo only. */
  photoOnly?: boolean;
  showPhoto: boolean;
  onShowPhoto: () => void;
  photoCount: number;
  photoUrls?: string[];
  onPhotosChange: (files: FileList | null) => void;
  /** Attach an on-screen (stylus) working sheet as an image. */
  onAddDrawing?: (file: File) => void;
  result: Result | null;
  attempts: number;
  checking: boolean;
  checkError: string | undefined;
  onCheck: () => void;
  thread: TutorTurn[];
  reply: string;
  onReplyChange: (value: string) => void;
  tutoring: boolean;
  tutorError: string | undefined;
  onSend: () => void;
  /** Homework locked for suspected AI use or a passed due date — read-only. */
  locked?: boolean;
  /** Mark-scheme answer, only present once the teacher reveals it. */
  markScheme?: string | null;
  /** Optional action shown in the question header (e.g. message the teacher). */
  headerAction?: ReactNode;
  /** Show a Chinese gloss on key words when hovered. */
  keywordTranslation?: boolean;
  /** Block copying/selecting the question text. */
  protectQuestions?: boolean;
  /** Needed to gloss the AI tutor's replies in the student's language. */
  assignmentId?: string;
  /** Set when the teacher sent this question back to be redone. */
  sentBack?: { at: string; note: string | null } | null;
}) {
  const verdict = result?.verdict ?? null;
  const glossary = useQuery({
    queryKey: ["question-glossary", question.id],
    queryFn: () => getQuestionGlossary({ data: { questionId: question.id } }),
    enabled: keywordTranslation,
    staleTime: Infinity,
  });
  const lastTutorMessage =
    [...thread].reverse().find((message) => message.role === "tutor")?.content ?? "";
  const tutorGlossary = useQuery({
    queryKey: ["tutor-glossary", assignmentId, lastTutorMessage.slice(0, 240)],
    queryFn: () =>
      getTutorGlossary({ data: { assignmentId: assignmentId!, text: lastTutorMessage } }),
    enabled: keywordTranslation && Boolean(assignmentId) && lastTutorMessage.length > 0,
    staleTime: Infinity,
  });
  const tutorTerms = keywordTranslation
    ? [...(glossary.data?.terms ?? []), ...(tutorGlossary.data?.terms ?? [])]
    : [];

  const answerGuard = useOriginalTypingGuard();
  const tutorGuard = useOriginalTypingGuard();
  const bulletTarget = photoOnly ? 0 : bulletTargetFor(question.marks, requiresPhoto);
  const hasWrittenAnswer = stripBullets(draft).trim().length > 0;

  // Seed the marks checklist so the student sees how many points are expected.
  useEffect(() => {
    if (bulletTarget > 0 && !locked && draft.trim().length === 0) {
      onDraftChange(normaliseBullets("", bulletTarget));
    }
  }, [bulletTarget, locked, draft, onDraftChange]);

  return (
    <section className="paper p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-xl">
          Question {questionLabel(question.question_text, index)}
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {result ? `${result.awardedMarks}/` : ""}{question.marks} marks
          </Badge>
          {headerAction}
        </div>
      </div>

      {/* Question wording is never selectable or copyable for students, regardless
          of the teacher's wider copy setting. */}
      <div
        className="select-none [-webkit-touch-callout:none] [-webkit-user-select:none]"
        onCopy={(event) => event.preventDefault()}
        onCut={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        onMouseDown={(event) => {
          // Stops double/triple-click selection of the wording.
          if (event.detail > 1) event.preventDefault();
        }}
      >

        <GlossaryText
          className="mt-3 whitespace-pre-wrap"
          text={questionBody(question.question_text)}
          terms={keywordTranslation ? (glossary.data?.terms ?? []) : []}
        />
        {keywordTranslation && (glossary.data?.terms?.length ?? 0) > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Hover (or tap and hold) any underlined word — in the question or in the tutor’s replies — to see it translated.
          </p>
        ) : null}
      </div>

      <div className="mt-3">
        <QuestionHelpButtons questionId={question.id} answerDraft={draft} />
      </div>


      {sentBack ? (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-medium">Your teacher sent this question back to redo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {sentBack.note ?? "Answer it again in your own words and your own hand-drawn working."}
          </p>
        </div>
      ) : null}

      {markScheme ? (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">Mark scheme (released by your teacher)</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{cleanMathText(markScheme)}</p>
        </div>
      ) : null}


      <div className="mt-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Answer whichever way suits you: type it below, upload or take a photo of your paper, or
          write it on the pad. {requiresPhoto ? "For this one, working on paper usually earns the most method marks." : null}
        </p>

        <Textarea
          value={draft}
          onChange={(event) => {
            if (answerGuard.flagged) answerGuard.clearFlag();
            onDraftChange(
              bulletTarget > 0
                ? normaliseBullets(event.target.value, bulletTarget)
                : event.target.value,
            );
          }}
          {...answerGuard.guardProps}
          disabled={locked}
          placeholder={
            requiresPhoto
              ? "Type your answer or describe your working (a photo or pad sketch can be added below)"
              : "Write your answer in English"
          }
          rows={Math.max(4, bulletTarget + 1)}
        />
        {bulletTarget > 0 ? (
          <p className="text-xs text-muted-foreground">
            {bulletTarget} marks means {bulletTarget} separate points — write one point on each
            bullet. The bullets stay put; add extra lines if you need them.
          </p>
        ) : null}

        {answerGuard.flagged ? (
          <p className="text-sm text-destructive">{NO_PASTE_MESSAGE}</p>
        ) : null}

        {draft && !isEnglishOnly(draft) ? (
          <p className="text-sm text-destructive">{ENGLISH_ONLY_MESSAGE}</p>
        ) : null}

        <div className="rounded-lg border border-dashed border-border p-3">
          <Label
            htmlFor={`photo-${question.id}`}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Camera className="size-4" />
            Your working or diagram
            {requiresPhoto ? <Badge variant="secondary">recommended here</Badge> : null}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Photograph your own hand-written or hand-drawn work, take one with your device camera,
            or draw it on the pad below. Diagrams or images copied from websites, textbooks,
            screenshots or apps are rejected as plagiarism. This is optional if you typed your
            answer.
          </p>
          <Input
            id={`photo-${question.id}`}
            type="file"
            accept="image/*"
            multiple
            className="mt-2"
            disabled={locked}
            onChange={(event) => onPhotosChange(event.target.files)}
          />
          {onAddDrawing ? (
            <div className="mt-2">
              <CameraCapture disabled={locked} onCapture={onAddDrawing} />
            </div>
          ) : null}
          {photoCount > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {photoCount} photo{photoCount === 1 ? "" : "s"} ready — they&apos;ll be marked with
              your answer.
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
              Show your full drawing or working — marks are given for the method as well as the
              final answer.
            </p>
          ) : null}

          {onAddDrawing ? (
            <div className="mt-3">
              <DrawingPad disabled={locked} onAttach={onAddDrawing} />
            </div>
          ) : null}
        </div>


        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {attempts > 0 ? `${attempts} attempt${attempts === 1 ? "" : "s"}` : ""}
          </span>
          <Button
            onClick={onCheck}
            disabled={
              locked ||
              checking ||
              (!hasWrittenAnswer && photoCount === 0) ||
              !isEnglishOnly(draft)
            }
          >
            {locked ? "Locked" : checking ? "Marking..." : result ? "Re-check answer" : "Check answer"}
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
            <TutorText className="mt-2 space-y-1 text-sm" text={result.feedback} />
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
                  {message.role === "tutor" ? (
                    <GlossaryText
                      className="whitespace-pre-wrap"
                      text={cleanTutorText(message.content)}
                      terms={tutorTerms}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
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
                onChange={(event) => {
                  if (tutorGuard.flagged) tutorGuard.clearFlag();
                  onReplyChange(event.target.value);
                }}
                {...tutorGuard.guardProps}
                disabled={locked}
                placeholder="Reply to the tutor, or ask a follow-up question — as many as you need"
                rows={2}
              />

              <Button
                variant="secondary"
                onClick={onSend}
                disabled={locked || !reply.trim() || tutoring || !isEnglishOnly(reply)}
              >
                {tutoring ? "Thinking..." : "Send"}
              </Button>
            </div>
            {tutorGuard.flagged ? (
              <p className="text-sm text-destructive">{NO_PASTE_MESSAGE}</p>
            ) : null}
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