import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, Eye, EyeOff, ImageUp, XCircle } from "lucide-react";
import { toast } from "sonner";

import { QuestionHelpButtons } from "@/components/assignments/QuestionHelpDialog";
import { parseSnipBand, QuestionSnipStack } from "@/components/assignments/QuestionSnip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { gradeAnswer, previewGradeAnswer } from "@/lib/app.functions";
import { normalisePhotoFiles } from "@/lib/heic";
import { COVERED_MARK_SCHEME_PERCENT } from "@/lib/mark-scheme-reveal";
import { resolveQuestionLabels } from "@/lib/question-label";

export const PHOTO_PAGE_FILE_PREFIX = "photo-page-answer-";

type PhotoQuestion = {
  id: string;
  position: number;
  question_text: string;
  marks: number;
  imageUrls?: string[];
  answerImageUrls?: string[];
};

type PhotoAnswer = {
  question_id: string;
  answer_text?: string | null;
  image_paths?: string[] | null;
  imageUrls?: string[];
  verdict?: string | null;
  awarded_marks?: number | null;
  feedback?: string | null;
  attempts?: number;
};

type PhotoResult = {
  verdict: string;
  awardedMarks: number;
  feedback: string;
};

function pageKey(url: string) {
  return (url.split("#")[0] ?? url).split("?")[0] ?? url;
}

function pageGroups(questions: PhotoQuestion[]) {
  const groups = new Map<string, { referenceUrl: string; questions: PhotoQuestion[] }>();
  for (const question of questions) {
    for (const url of question.imageUrls ?? []) {
      if (!parseSnipBand(url)) continue;
      const key = pageKey(url);
      const group = groups.get(key) ?? { referenceUrl: url.split("#")[0] ?? url, questions: [] };
      if (!group.questions.some((item) => item.id === question.id)) group.questions.push(question);
      groups.set(key, group);
    }
  }
  return [...groups.entries()].map(([key, value], index) => ({
    key,
    label: `Paper page ${index + 1}`,
    ...value,
  }));
}

async function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The photographed page could not be read."));
    image.src = url;
  });
}

async function cropQuestion(
  file: File,
  band: { top: number; bottom: number },
  trim: { top: number; bottom: number },
  name: string,
) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const pageHeight = Math.max(0.05, trim.bottom - trim.top);
    const top = Math.max(0, Math.min(0.98, trim.top + band.top * pageHeight));
    const bottom = Math.max(top + 0.02, Math.min(1, trim.top + band.bottom * pageHeight));
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = Math.max(1, Math.round((bottom - top) * image.naturalHeight));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The photographed page could not be cropped.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      0,
      Math.round(top * image.naturalHeight),
      image.naturalWidth,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("The crop could not be saved."))),
        "image/jpeg",
        0.9,
      ),
    );
    return new File([blob], name, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function CoveredScheme({ urls }: { urls: string[] }) {
  const [revealed, setRevealed] = useState(COVERED_MARK_SCHEME_PERCENT);
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Mark scheme</p>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setRevealed(0)}>
            <EyeOff className="size-3.5" /> Cover
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRevealed(100)}>
            <Eye className="size-3.5" /> Uncover
          </Button>
        </div>
      </div>
      <div className="relative mt-2 overflow-hidden rounded-md">
        <QuestionSnipStack urls={urls} answers alt="Official mark scheme" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-card"
          style={{ height: `${100 - revealed}%` }}
        />
        <input
          aria-label="Reveal the mark scheme"
          type="range"
          min={0}
          max={100}
          value={revealed}
          onChange={(event) => setRevealed(Number(event.target.value))}
          className="absolute inset-x-2 bottom-1 z-10 w-[calc(100%_-_1rem)]"
        />
      </div>
    </div>
  );
}

export function PhotoPageMode({
  assignmentId,
  questions,
  answers,
  locked,
  revealOnFullMarks,
  markSchemeRevealed,
  allowHint,
  allowSteps,
  queryKey,
  preview = false,
  onPreviewResult,
}: {
  assignmentId: string;
  questions: PhotoQuestion[];
  answers: PhotoAnswer[];
  locked: boolean;
  revealOnFullMarks: boolean;
  markSchemeRevealed: boolean;
  allowHint: boolean;
  allowSteps: boolean;
  queryKey?: string[];
  preview?: boolean;
  onPreviewResult?: (questionId: string, result: PhotoResult) => void;
}) {
  const grade = useServerFn(gradeAnswer);
  const previewGrade = useServerFn(previewGradeAnswer);
  const queryClient = useQueryClient();
  const groups = useMemo(() => pageGroups(questions), [questions]);
  const labels = useMemo(
    () => resolveQuestionLabels(questions.map((question) => question.question_text)),
    [questions],
  );
  const [pageKeyValue, setPageKeyValue] = useState(groups[0]?.key ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [trim, setTrim] = useState({ top: 0, bottom: 1 });
  const [questionBands, setQuestionBands] = useState<
    Record<string, { top: number; bottom: number }>
  >({});
  const [adjusting, setAdjusting] = useState(false);
  const [marking, setMarking] = useState(false);
  const [localResults, setLocalResults] = useState<Record<string, PhotoResult>>({});
  const group = groups.find((item) => item.key === pageKeyValue) ?? groups[0];

  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );

  const resultFor = (question: PhotoQuestion) => {
    const local = localResults[question.id];
    if (local) return local;
    const saved = answers.find((answer) => answer.question_id === question.id);
    return saved?.verdict
      ? {
          verdict: saved.verdict,
          awardedMarks: Number(saved.awarded_marks ?? 0),
          feedback: saved.feedback ?? "",
        }
      : undefined;
  };

  if (groups.length === 0) {
    return (
      <div className="paper p-6 text-sm">
        <p className="font-medium">Photo mode needs the original question-paper pages.</p>
        <p className="mt-2 text-muted-foreground">
          Ask the teacher to upload the blank question paper separately from the mark scheme and
          verify its question cuts. The other two homework modes remain available.
        </p>
      </div>
    );
  }

  const markPage = async () => {
    if (!photo || !group) return;
    const remaining = group.questions.filter(
      (question) => resultFor(question)?.verdict !== "correct",
    );
    if (remaining.length === 0) {
      toast.success("Every question on this page is already correct.");
      return;
    }
    setMarking(true);
    try {
      const { data } = preview ? { data: { user: null } } : await supabase.auth.getUser();
      if (!preview && !data.user) throw new Error("Please sign in again.");
      for (const question of remaining) {
        const sourceUrl = (question.imageUrls ?? []).find(
          (url) => pageKey(url) === group.key && parseSnipBand(url),
        );
        const band = sourceUrl ? parseSnipBand(sourceUrl) : null;
        if (!band) continue;
        const filename = `${PHOTO_PAGE_FILE_PREFIX}${Date.now()}-${question.id}.jpg`;
        const crop = await cropQuestion(photo, questionBands[question.id] ?? band, trim, filename);
        let result: PhotoResult;
        if (preview) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("The crop could not be prepared."));
            reader.readAsDataURL(crop);
          });
          result = await previewGrade({
            data: {
              assignmentId,
              questionId: question.id,
              answerText: "",
              imageDataUrls: [dataUrl],
              padDataUrls: [],
              priorFlags: 0,
            },
          });
          onPreviewResult?.(question.id, result);
        } else {
          const path = `${data.user!.id}/${assignmentId}/${question.id}/${filename}`;
          const { error } = await supabase.storage
            .from("student-work")
            .upload(path, crop, { contentType: "image/jpeg", upsert: true });
          if (error) throw new Error(error.message);
          const otherModePaths =
            answers
              .find((answer) => answer.question_id === question.id)
              ?.image_paths?.filter((existing) => !existing.includes(PHOTO_PAGE_FILE_PREFIX)) ?? [];
          const existingText =
            answers.find((answer) => answer.question_id === question.id)?.answer_text ?? "";
          result = await grade({
            data: {
              assignmentId,
              questionId: question.id,
              // Keep work from Question mode stored while adding this mode's
              // photograph. The shared result still belongs to the question.
              answerText: existingText,
              imagePaths: [...otherModePaths, path].slice(-6),
            },
          });
        }
        setLocalResults((current) => ({ ...current, [question.id]: result }));
      }
      if (!preview && queryKey) await queryClient.refetchQueries({ queryKey, type: "active" });
      toast.success("Page marked. Correct questions will be skipped next time.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="space-y-4">
        <div className="paper p-5">
          <h2 className="font-display text-xl">Photograph a completed paper page</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the matching blank page, upload one clear full-page photo, then confirm the page
            edges. Previously correct questions are never marked again.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Matching paper page
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                value={group?.key ?? ""}
                onChange={(event) => setPageKeyValue(event.target.value)}
              >
                {groups.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label} · {item.questions.length} question
                    {item.questions.length === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Completed page photo
              <Input
                className="mt-1"
                type="file"
                accept="image/*,.heic,.heif"
                capture="environment"
                disabled={locked}
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (!selected) return;
                  void normalisePhotoFiles([selected]).then(([ready]) => {
                    if (!ready) return;
                    if (photoUrl) URL.revokeObjectURL(photoUrl);
                    setPhoto(ready);
                    setPhotoUrl(URL.createObjectURL(ready));
                  });
                }}
              />
            </label>
          </div>
          {photoUrl ? (
            <div className="mt-4">
              <div className="relative overflow-hidden rounded-lg border bg-muted">
                <img src={photoUrl} alt="Completed full paper page" className="w-full" />
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 bg-destructive/20"
                  style={{ height: `${trim.top * 100}%` }}
                />
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 bg-destructive/20"
                  style={{ height: `${(1 - trim.bottom) * 100}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setAdjusting((value) => !value)}>
                  {adjusting ? "Finish adjusting page" : "Adjust page crop"}
                </Button>
                <Button onClick={markPage} disabled={locked || marking}>
                  <ImageUp className="size-4" /> {marking ? "Marking page…" : "Mark this page"}
                </Button>
              </div>
              {adjusting ? (
                <div className="mt-3 space-y-4 rounded-lg border p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs">
                      Page top edge
                      <input
                        type="range"
                        min={0}
                        max={35}
                        value={Math.round(trim.top * 100)}
                        onChange={(event) =>
                          setTrim((current) => ({
                            ...current,
                            top: Math.min(current.bottom - 0.2, Number(event.target.value) / 100),
                          }))
                        }
                        className="w-full"
                      />
                    </label>
                    <label className="text-xs">
                      Page bottom edge
                      <input
                        type="range"
                        min={65}
                        max={100}
                        value={Math.round(trim.bottom * 100)}
                        onChange={(event) =>
                          setTrim((current) => ({
                            ...current,
                            bottom: Math.max(current.top + 0.2, Number(event.target.value) / 100),
                          }))
                        }
                        className="w-full"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    If one automatic question cut is wrong, adjust only that cut below.
                  </p>
                  {group?.questions.map((question) => {
                    const sourceUrl = (question.imageUrls ?? []).find(
                      (url) => pageKey(url) === group.key && parseSnipBand(url),
                    );
                    const automatic = sourceUrl ? parseSnipBand(sourceUrl) : null;
                    if (!automatic) return null;
                    const selectedBand = questionBands[question.id] ?? automatic;
                    const questionIndex = questions.indexOf(question);
                    return (
                      <div key={question.id} className="grid gap-2 border-t pt-3 sm:grid-cols-2">
                        <p className="text-xs font-medium sm:col-span-2">
                          Question {labels[questionIndex] ?? questionIndex + 1}
                        </p>
                        <label className="text-xs">
                          Cut starts
                          <input
                            type="range"
                            min={0}
                            max={98}
                            value={Math.round(selectedBand.top * 100)}
                            onChange={(event) =>
                              setQuestionBands((current) => ({
                                ...current,
                                [question.id]: {
                                  ...selectedBand,
                                  top: Math.min(
                                    selectedBand.bottom - 0.02,
                                    Number(event.target.value) / 100,
                                  ),
                                },
                              }))
                            }
                            className="w-full"
                          />
                        </label>
                        <label className="text-xs">
                          Cut ends
                          <input
                            type="range"
                            min={2}
                            max={100}
                            value={Math.round(selectedBand.bottom * 100)}
                            onChange={(event) =>
                              setQuestionBands((current) => ({
                                ...current,
                                [question.id]: {
                                  ...selectedBand,
                                  bottom: Math.max(
                                    selectedBand.top + 0.02,
                                    Number(event.target.value) / 100,
                                  ),
                                },
                              }))
                            }
                            className="w-full"
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {group?.questions.map((question) => {
          const result = resultFor(question);
          const answer = answers.find((item) => item.question_id === question.id);
          const savedPhotos = (answer?.imageUrls ?? []).filter((url) =>
            url.includes(PHOTO_PAGE_FILE_PREFIX),
          );
          const index = questions.indexOf(question);
          const showScheme =
            (markSchemeRevealed ||
              (revealOnFullMarks && result?.awardedMarks === question.marks)) &&
            Boolean(question.answerImageUrls?.length);
          return (
            <section key={question.id} className="paper space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">Question {labels[index] ?? index + 1}</p>
                <Badge>
                  {result?.awardedMarks ?? 0}/{question.marks}
                </Badge>
              </div>
              {savedPhotos.length ? (
                <QuestionSnipStack urls={savedPhotos} alt="Your photographed answer" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your answer will appear here after this page is marked.
                </p>
              )}
              {result?.feedback ? <p className="text-sm">{result.feedback}</p> : null}
              {result && result.verdict !== "correct" ? (
                <QuestionHelpButtons
                  questionId={question.id}
                  answerDraft="Photographed handwritten answer"
                  allowHint={allowHint}
                  allowSteps={allowSteps}
                />
              ) : null}
              {showScheme ? <CoveredScheme urls={question.answerImageUrls ?? []} /> : null}
            </section>
          );
        })}
      </div>

      <aside className="paper sticky top-4 p-3">
        <p className="font-display text-lg">This page</p>
        <div className="mt-3 grid grid-cols-3 gap-1">
          {group?.questions.map((question) => {
            const result = resultFor(question);
            const index = questions.indexOf(question);
            return (
              <div
                className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs"
                key={question.id}
              >
                {result?.verdict === "correct" ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : result?.verdict === "partial" ? (
                  <CircleDashed className="size-4 text-amber-500" />
                ) : result ? (
                  <XCircle className="size-4 text-destructive" />
                ) : null}
                Q{labels[index] ?? index + 1}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
