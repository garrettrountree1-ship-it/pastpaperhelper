import { useQuery } from "@tanstack/react-query";
import {
  Calculator,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { QuestionSnipStack } from "@/components/assignments/QuestionSnip";
import { StudentWorkPhoto } from "@/components/StudentWorkPhoto";
import { QuestionVocabBox } from "@/components/assignments/QuestionVocabBox";

import { cleanTutorText, TutorText } from "@/lib/tutor-text";
import { getQuestionGlossary, getTutorGlossary } from "@/lib/tutor-settings.functions";

import { CameraCapture } from "@/components/assignments/CameraCapture";
import { QuestionHelpButtons } from "@/components/assignments/QuestionHelpDialog";

import { DrawingPad, PAD_FILE_NAME } from "@/components/assignments/DrawingPad";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bulletTargetFor, normaliseBullets, stripBullets } from "@/lib/bullet-scaffold";
import { NO_PASTE_MESSAGE } from "@/lib/integrity";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";
import { questionBody, questionLabel } from "@/lib/question-label";
import { QuestionTagBadge } from "@/components/assignments/QuestionTagBadge";

// Re-export through the established assignment experience module so the
// student route does not compete with the legacy PaperMode import during
// rolling branch merges.
export { StudentPaperMode as ContinuousStudentPaperMode } from "@/components/assignments/ContinuousPaperMode";

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

function StudyMarkScheme({ urls, action }: { urls: string[]; action: ReactNode }) {
  const [revealed, setRevealed] = useState(100);
  const frame = useRef<HTMLDivElement | null>(null);
  const setFromPointer = (clientY: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setRevealed(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)));
  };
  return (
    <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Mark scheme</p>
        <p className="text-xs text-muted-foreground">Drag the cover or use ↑ ↓ to self-quiz</p>
      </div>
      <div ref={frame} className="relative mt-2 overflow-hidden rounded-lg">
        <QuestionSnipStack
          urls={urls}
          answers
          alt="Official answer as printed in the mark scheme"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-card"
          style={{ height: `${100 - revealed}%` }}
          aria-hidden
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Reveal or cover the mark scheme"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(revealed)}
          className="absolute inset-x-0 z-10 h-3 -translate-y-1/2 cursor-ns-resize touch-none border-y border-primary/50 bg-primary/20 outline-none focus:ring-2 focus:ring-primary"
          style={{ top: `${revealed}%` }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setFromPointer(event.clientY);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              setFromPointer(event.clientY);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            setRevealed((value) =>
              Math.max(0, Math.min(100, value + (event.key === "ArrowDown" ? 5 : -5))),
            );
          }}
        />
      </div>
      {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

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
  photoFiles = [],
  onRemovePhoto,
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
  markSchemeImageUrls = [],
  paperModeUrls: providedPaperModeUrls = [],
  answerAction = null,
  headerAction = null,
  snipAction = null,
  keywordTranslation = false,
  allowHint = true,
  allowSteps = true,
  maxAttempts = 0,
  assignmentId,
  sentBack = null,
  snipUrls = [],
  referenceImageUrls = [],
  readOnly = false,
  creditedAll = false,
  answerCheckMode = null,
}: {
  question: {
    id: string;
    question_text: string;
    marks: number;
    tagLabel?: string | null;
    tagImage?: string | null;
    multipleChoice?: boolean;
  };

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
  /** Photos picked but not submitted yet, so they can be previewed and removed. */
  photoFiles?: { name: string; url: string }[];
  onRemovePhoto?: (name: string) => void;
  onPhotosChange: (files: FileList | null) => void;
  /** Attach an on-screen (stylus) working sheet as an image. */
  onAddDrawing?: (file: File) => void | Promise<void>;
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
  /** The official answer exactly as printed, shown only once released. */
  markSchemeImageUrls?: string[];
  /** Saved annotated paper-mode answer images for this question. */
  paperModeUrls?: string[];
  /** Teacher-only control beside the answer picture (recut). */
  answerAction?: React.ReactNode;
  /** Optional action shown in the question header (e.g. message the teacher). */
  headerAction?: ReactNode;
  /** Teacher-only action displayed beside the printed question image. */
  snipAction?: ReactNode;
  /** Show the Question Vocabulary Translation box under the question. */
  keywordTranslation?: boolean;
  /** Scaffolding: "Give me a hint" available. */
  allowHint?: boolean;
  /** Scaffolding: step-by-step breakdown available. */
  allowSteps?: boolean;
  /** Scaffolding: tries allowed per question; 0 means unlimited. */
  maxAttempts?: number;
  /** Block copying/selecting the question text. */
  protectQuestions?: boolean;
  /** Needed to add key words from the AI tutor's replies to the vocabulary box. */
  assignmentId?: string;
  /** Set when the teacher sent this question back to be redone. */
  sentBack?: { at: string; note: string | null } | null;
  /** Snipped picture(s) of the question as printed — shown instead of typed wording. */
  snipUrls?: string[];
  /** A prior drawing this question explicitly asks the student to amend. */
  referenceImageUrls?: string[];
  /** Teacher looking at a student's work: everything visible, nothing changeable. */
  readOnly?: boolean;
  /** The teacher gave the whole class full marks for this question. */
  creditedAll?: boolean;
  /** Teacher-selected calculation marking rule, shown clearly to the student. */
  answerCheckMode?: "final-number" | "full-working" | null;
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
  const [drawingSaving, setDrawingSaving] = useState(false);
  const bulletTarget = photoOnly ? 0 : bulletTargetFor(question.marks, requiresPhoto);
  const hasWrittenAnswer = stripBullets(draft).trim().length > 0;
  const outOfTries = maxAttempts > 0 && attempts >= maxAttempts;
  const hasFullCredit =
    creditedAll ||
    Boolean(result && question.marks > 0 && Number(result.awardedMarks) >= question.marks);

  // The writing pad keeps its own picture inside the pad, so it never shows here.
  const attachedPhotos = useMemo(
    () =>
      photoFiles
        .filter((item) => item.name !== PAD_FILE_NAME)
        .map((item, itemIndex) => ({ ...item, key: `${itemIndex}-${item.name}` })),
    [photoFiles],
  );
  const submittedPhotoUrls = photoUrls.filter((url) => !url.includes(PAD_FILE_NAME));
  // New paper mode passes its saved cuts explicitly, while older submissions stored
  // them alongside ordinary photos. Combine both sources without shadowing the prop.
  const savedPaperModeUrls = useMemo(
    () => [
      ...new Set([
        ...providedPaperModeUrls,
        ...photoUrls.filter((url) => url.includes(PAD_FILE_NAME)),
      ]),
    ],
    [providedPaperModeUrls, photoUrls],
  );
  const paperModeUrls = photoUrls.filter((url) => url.includes(PAD_FILE_NAME));

  // Seed the marks checklist so the student sees how many points are expected.
  useEffect(() => {
    if (bulletTarget > 0 && !locked && !readOnly && draft.trim().length === 0) {
      onDraftChange(normaliseBullets("", bulletTarget));
    }
  }, [bulletTarget, locked, readOnly, draft, onDraftChange]);

  return (
    <section className="paper p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">
            Question {questionLabel(question.question_text, index)}{" "}
            <QuestionTagBadge label={question.tagLabel} image={question.tagImage} />
          </h2>
          {answerCheckMode === "final-number" && !question.multipleChoice ? (
            <div className="mt-2 flex max-w-xl items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-emerald-950 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-50">
              <Calculator className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="text-xs leading-relaxed">
                <p className="font-semibold">A correct final number earns full credit</p>
                <p className="text-emerald-800 dark:text-emerald-200">
                  You can enter just your answer, or show all your working to earn partial credit.
                </p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {hasFullCredit ? (
            <CheckCircle2 className="size-6 shrink-0 text-emerald-600" aria-label="Full credit" />
          ) : verdict === "partial" ? (
            <CircleDashed className="size-6 shrink-0 text-amber-600" aria-label="Partial credit" />
          ) : result ? (
            <XCircle className="size-6 shrink-0 text-destructive" aria-label="Not correct yet" />
          ) : null}
          <Badge variant="secondary">
            {result ? `${result.awardedMarks}/` : ""}
            {question.marks} marks
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex gap-3">
        <div className="min-w-0 flex-1">
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
            {snipUrls.length > 0 ? (
              <>
                <QuestionSnipStack
                  urls={snipUrls}
                  alt="The question exactly as printed on the paper"
                />
                {snipAction ? <div className="mt-2 flex justify-end">{snipAction}</div> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  The question exactly as printed. Answer it in the box below.
                </p>
              </>
            ) : (
              <p className="mt-3 whitespace-pre-wrap">{questionBody(question.question_text)}</p>
            )}
          </div>

          {markSchemeImageUrls.length > 0 ? (
            <StudyMarkScheme urls={markSchemeImageUrls} action={answerAction} />
          ) : null}

          {savedPaperModeUrls.length > 0 ? (
            <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-medium">Paper mode answer</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Saved from the continuous paper when this question was marked.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {savedPaperModeUrls.map((url) => (
                  <StudentWorkPhoto
                    key={url}
                    url={url}
                    alt="Paper mode answer"
                    className="h-32 w-48 rounded-lg border border-border object-contain"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {keywordTranslation ? (
            tutorTerms.length > 0 ? (
              <QuestionVocabBox
                className="mt-3"
                terms={tutorTerms}
                language={glossary.data?.language ?? "Chinese (Simplified)"}
              />
            ) : glossary.isPending ? (
              <p className="mt-3 text-xs text-muted-foreground">Preparing the key words…</p>
            ) : null
          ) : null}

          {sentBack ? (
            <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
              <p className="text-sm font-medium">Your teacher sent this question back to redo</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {sentBack.note ??
                  "Answer it again in your own words and your own hand-drawn working."}
              </p>
            </div>
          ) : null}

          {creditedAll ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 p-4">
              <CheckCircle2 className="mt-0.5 size-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Full marks given for this question</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your teacher gave the whole class full marks here, so there is nothing left to
                  answer.
                </p>
              </div>
            </div>
          ) : null}

          <details
            open={readOnly || undefined}
            className="group mt-4 rounded-xl border border-border bg-background/40"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
                {readOnly ? "Student answer and feedback" : "Your answer and feedback"}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {hasWrittenAnswer ? "Typed" : null}
                {submittedPhotoUrls.length > 0 || attachedPhotos.length > 0
                  ? `${submittedPhotoUrls.length + attachedPhotos.length} image${submittedPhotoUrls.length + attachedPhotos.length === 1 ? "" : "s"}`
                  : null}
                {result ? (
                  <Badge variant={hasFullCredit ? "default" : "secondary"}>
                    {result.awardedMarks}/{question.marks}
                  </Badge>
                ) : null}
              </span>
            </summary>
            <div className="border-t border-border px-4 pb-4">
              {/* Mark-scheme and paper-mode images intentionally render above this
              answer panel. Keeping them out of here prevents duplicate blocks. */}
              {markSchemeImageUrls.length > 0 ? (
                <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm font-medium">Mark scheme</p>
                  {/* Answers are only ever shown as the picture cut from the printed
              mark scheme — never as retyped text. */}
                  <QuestionSnipStack
                    urls={markSchemeImageUrls}
                    answers
                    alt="Official answer as printed in the mark scheme"
                    className="mt-2"
                  />
                  {answerAction ? (
                    <div className="mt-3 flex flex-wrap gap-2">{answerAction}</div>
                  ) : null}
                </div>
              ) : null}

              {paperModeUrls.length > 0 ? (
                <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm font-medium">Paper mode answer</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Saved from the continuous paper when this question was marked.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {paperModeUrls.map((url) => (
                      <StudentWorkPhoto
                        key={url}
                        url={url}
                        alt="Paper mode answer"
                        className="h-32 w-48 rounded-lg border border-border object-contain"
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {readOnly ? null : (
                  <p className="text-xs text-muted-foreground">
                    Answer whichever way suits you: type it below, upload or take a photo of your
                    paper, or write it on the pad.{" "}
                    {requiresPhoto
                      ? "For this one, working on paper usually earns the most method marks."
                      : null}
                  </p>
                )}

                <details
                  open={readOnly || undefined}
                  className="rounded-lg border border-dashed border-border p-3"
                >
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    {readOnly ? "Typed answer" : "Type your answer"}
                  </summary>
                  <div className="mt-2 space-y-3">
                    <Textarea
                      value={draft}
                      onChange={(event) => {
                        if (readOnly) return;
                        if (answerGuard.flagged) answerGuard.clearFlag();
                        onDraftChange(
                          bulletTarget > 0
                            ? normaliseBullets(event.target.value, bulletTarget)
                            : event.target.value,
                        );
                      }}
                      {...(readOnly ? {} : answerGuard.guardProps)}
                      readOnly={readOnly}
                      disabled={locked && !readOnly}
                      placeholder={
                        readOnly
                          ? "This student hasn't typed an answer here yet."
                          : requiresPhoto
                            ? "Type your answer or describe your working (a photo or pad sketch can be added below)"
                            : "Write your answer in English"
                      }
                      rows={Math.max(4, bulletTarget + 1)}
                    />
                    {bulletTarget > 0 && !readOnly ? (
                      <p className="text-xs text-muted-foreground">
                        {bulletTarget} marks means {bulletTarget} separate points — write one point
                        on each bullet. The bullets stay put; add extra lines if you need them.
                      </p>
                    ) : null}

                    {answerGuard.flagged ? (
                      <p className="text-sm text-destructive">{NO_PASTE_MESSAGE}</p>
                    ) : null}

                    {draft && !isEnglishOnly(draft) ? (
                      <p className="text-sm text-destructive">{ENGLISH_ONLY_MESSAGE}</p>
                    ) : null}
                  </div>
                </details>

                {/* Photo and pad sections stay folded away until they're needed. */}
                <details className="rounded-lg border border-dashed border-border p-3">
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Camera className="size-4" />
                    {readOnly ? "Photos and working handed in" : "Photo of your working or diagram"}
                    {requiresPhoto && !readOnly ? (
                      <Badge variant="secondary">recommended here</Badge>
                    ) : null}
                  </summary>
                  {readOnly ? (
                    submittedPhotoUrls.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        No photos or drawings handed in for this question yet.
                      </p>
                    ) : null
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Photograph your own hand-written or hand-drawn work, or take one with your
                      device camera. Diagrams or images copied from websites, textbooks, screenshots
                      or apps are rejected as plagiarism. This is optional if you typed your answer.
                    </p>
                  )}
                  {readOnly ? null : (
                    <Input
                      id={`photo-${question.id}`}
                      type="file"
                      accept="image/*"
                      multiple
                      className="mt-2"
                      disabled={locked}
                      onChange={(event) => onPhotosChange(event.target.files)}
                    />
                  )}
                  {onAddDrawing && !readOnly ? (
                    <div className="mt-2">
                      <CameraCapture disabled={locked} onCapture={onAddDrawing} />
                    </div>
                  ) : null}
                  {attachedPhotos.length > 0 ? (
                    <>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {attachedPhotos.length} photo{attachedPhotos.length === 1 ? "" : "s"} ready
                        — they&apos;ll be marked with your answer.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {attachedPhotos.map((item) => (
                          <div key={item.key} className="relative">
                            <img
                              src={item.url}
                              alt={item.name}
                              loading="lazy"
                              className="size-20 rounded-lg border border-border object-cover"
                            />
                            {onRemovePhoto && !locked ? (
                              <button
                                type="button"
                                aria-label={`Remove ${item.name}`}
                                title="Remove this photo"
                                onClick={() => onRemovePhoto(item.name)}
                                className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"
                              >
                                <X className="size-3.5" />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {submittedPhotoUrls.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {submittedPhotoUrls.map((url, photoIndex) => (
                        <StudentWorkPhoto
                          key={`${photoIndex}-${url.slice(-12)}`}
                          url={url}
                          alt="Uploaded working"
                          className="size-20 rounded-lg border border-border object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                  {requiresPhoto && !readOnly && answerCheckMode !== "final-number" ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Show your full drawing or working — marks are given for the method as well as
                      the final answer.
                    </p>
                  ) : null}
                </details>

                {onAddDrawing && !readOnly ? (
                  <details className="rounded-lg border border-dashed border-border p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      {referenceImageUrls.length > 0
                        ? "Edit your earlier diagram for this question"
                        : "Draw your answer on the pad"}
                    </summary>
                    <div className="mt-3">
                      {referenceImageUrls.length > 0 ? (
                        <p className="mb-2 text-xs text-muted-foreground">
                          This question refers back to your earlier drawing. It is loaded below so
                          you can add to it and submit the edited version for marking.
                        </p>
                      ) : null}
                      <DrawingPad
                        disabled={locked}
                        backgroundUrls={
                          referenceImageUrls.length > 0 ? referenceImageUrls : snipUrls
                        }
                        onAttach={onAddDrawing}
                        onSavePending={setDrawingSaving}
                      />
                    </div>
                  </details>
                ) : null}

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {maxAttempts > 0
                      ? `${attempts} of ${maxAttempts} ${maxAttempts === 1 ? "try" : "tries"} used`
                      : attempts > 0
                        ? `${attempts} attempt${attempts === 1 ? "" : "s"}`
                        : ""}
                  </span>
                  {readOnly ? null : (
                    <Button
                      onClick={onCheck}
                      disabled={
                        locked ||
                        creditedAll ||
                        outOfTries ||
                        checking ||
                        drawingSaving ||
                        (!hasWrittenAnswer && photoCount === 0) ||
                        !isEnglishOnly(draft)
                      }
                    >
                      {creditedAll
                        ? "Full marks given"
                        : locked
                          ? "Locked"
                          : outOfTries
                            ? "No tries left"
                            : checking
                              ? "Marking..."
                              : drawingSaving
                                ? "Saving drawing..."
                                : result
                                  ? "Re-check answer"
                                  : "Check answer"}
                    </Button>
                  )}
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
                      {verdict === "partial"
                        ? "Partly right"
                        : verdict === "correct"
                          ? "Correct"
                          : "Not yet"}
                    </span>
                  </div>
                  {result.feedback ? (
                    <TutorText className="mt-2 space-y-1 text-sm" text={result.feedback} />
                  ) : null}
                  {verdict !== "correct" && !readOnly ? (
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
                            <p className="whitespace-pre-wrap">{cleanTutorText(message.content)}</p>
                          ) : (
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {readOnly ? null : (
                    <div className="mt-4 space-y-2">
                      <Label
                        htmlFor={`ask-${question.id}`}
                        className="text-xs uppercase tracking-wide text-muted-foreground"
                      >
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
                        <p className="text-sm text-destructive">
                          Please ask your question in English.
                        </p>
                      ) : null}
                      {tutorError ? <p className="text-sm text-destructive">{tutorError}</p> : null}
                      <p className="text-xs text-muted-foreground">
                        The tutor never gives the answer, and your teacher can see these questions.
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </details>
        </div>

        <div className="flex flex-col items-center gap-2 pt-1">
          {headerAction}
          {readOnly ? null : (
            <QuestionHelpButtons
              questionId={question.id}
              answerDraft={draft}
              allowHint={allowHint}
              allowSteps={allowSteps}
            />
          )}
        </div>
      </div>
    </section>
  );
}
