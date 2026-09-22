import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  Crop,
  Eye,
  EyeOff,
  ImageUp,
  Minus,
  Plus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { QuestionHelpButtons } from "@/components/assignments/QuestionHelpDialog";
import { parseSnipBand, QuestionSnipStack } from "@/components/assignments/QuestionSnip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The photographed page could not be read."));
    image.src = url;
  });
}

/** Finds the rectangular sheet against its surroundings and returns only the page. */
async function trimPhotoToPage(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, 700 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const sample = document.createElement("canvas");
    sample.width = width;
    sample.height = height;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const corner = (x: number, y: number) => {
      const offset = (y * width + x) * 4;
      return [pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0];
    };
    const corners = [
      corner(0, 0),
      corner(width - 1, 0),
      corner(0, height - 1),
      corner(width - 1, height - 1),
    ];
    const background = [0, 1, 2].map(
      (channel) => corners.reduce((sum, value) => sum + (value[channel] ?? 0), 0) / corners.length,
    );
    const backgroundLight = (background[0]! * 3 + background[1]! * 6 + background[2]!) / 10;
    const belongsToPage = (x: number, y: number) => {
      const offset = (y * width + x) * 4;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      const difference =
        (Math.abs(red - background[0]!) +
          Math.abs(green - background[1]!) +
          Math.abs(blue - background[2]!)) /
        3;
      const light = (red * 3 + green * 6 + blue) / 10;
      return difference > 28 || (backgroundLight < 155 && light > 175);
    };
    const rowCoverage = Array.from({ length: height }, (_, y) => {
      let count = 0;
      for (let x = 0; x < width; x += 2) if (belongsToPage(x, y)) count += 1;
      return count / Math.ceil(width / 2);
    });
    const columnCoverage = Array.from({ length: width }, (_, x) => {
      let count = 0;
      for (let y = 0; y < height; y += 2) if (belongsToPage(x, y)) count += 1;
      return count / Math.ceil(height / 2);
    });
    const firstAbove = (values: number[], threshold: number) =>
      values.findIndex((value) => value >= threshold);
    const lastAbove = (values: number[], threshold: number) => {
      for (let index = values.length - 1; index >= 0; index -= 1) {
        if ((values[index] ?? 0) >= threshold) return index;
      }
      return -1;
    };
    let left = firstAbove(columnCoverage, 0.35);
    let right = lastAbove(columnCoverage, 0.35);
    let top = firstAbove(rowCoverage, 0.35);
    let bottom = lastAbove(rowCoverage, 0.35);
    const credible =
      left >= 0 &&
      top >= 0 &&
      right - left >= width * 0.45 &&
      bottom - top >= height * 0.45 &&
      (left > width * 0.015 ||
        right < width * 0.985 ||
        top > height * 0.015 ||
        bottom < height * 0.985);
    if (!credible) return file;
    const padding = Math.round(Math.min(width, height) * 0.008);
    left = Math.max(0, left - padding);
    right = Math.min(width - 1, right + padding);
    top = Math.max(0, top - padding);
    bottom = Math.min(height - 1, bottom + padding);
    const sourceX = Math.round((left / width) * image.naturalWidth);
    const sourceY = Math.round((top / height) * image.naturalHeight);
    const sourceWidth = Math.round(((right - left + 1) / width) * image.naturalWidth);
    const sourceHeight = Math.round(((bottom - top + 1) / height) * image.naturalHeight);
    const output = document.createElement("canvas");
    output.width = sourceWidth;
    output.height = sourceHeight;
    const outputContext = output.getContext("2d");
    if (!outputContext) return file;
    outputContext.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      output.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("The page could not be prepared."))),
        "image/jpeg",
        0.92,
      ),
    );
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-page.jpg", {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function imageFingerprint(source: File | string) {
  const objectUrl = source instanceof File ? URL.createObjectURL(source) : source;
  try {
    const image = await loadImage(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(image, 0, 0, 16, 16);
    const pixels = context.getImageData(0, 0, 16, 16).data;
    return Array.from({ length: 256 }, (_, index) => {
      const offset = index * 4;
      return (
        ((pixels[offset] ?? 0) * 3 + (pixels[offset + 1] ?? 0) * 6 + (pixels[offset + 2] ?? 0)) / 10
      );
    });
  } finally {
    if (source instanceof File) URL.revokeObjectURL(objectUrl);
  }
}

function fingerprintDistance(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) return Number.POSITIVE_INFINITY;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  return left.reduce(
    (distance, value, index) =>
      distance + Math.abs((value >= leftMean ? 1 : 0) - ((right[index] ?? 0) >= rightMean ? 1 : 0)),
    0,
  );
}

async function identifyPage(file: File, groups: ReturnType<typeof pageGroups>) {
  const uploaded = await imageFingerprint(file);
  const matches = await Promise.all(
    groups.map(async (group) => {
      try {
        return {
          key: group.key,
          distance: fingerprintDistance(uploaded, await imageFingerprint(group.referenceUrl)),
        };
      } catch {
        return { key: group.key, distance: Number.POSITIVE_INFINITY };
      }
    }),
  );
  const best = matches.sort((left, right) => left.distance - right.distance)[0];
  return best && Number.isFinite(best.distance) ? best.key : null;
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
    // The teacher's page-edge trim narrows the sheet first; the question band
    // is then measured inside the trimmed area.
    const span = Math.max(0.05, trim.bottom - trim.top);
    const relativeTop = trim.top + band.top * span;
    const relativeBottom = trim.top + band.bottom * span;
    // A small safety margin protects handwriting touching the prepared cut.
    const top = Math.max(0, Math.min(0.98, relativeTop - 0.008));
    const bottom = Math.max(top + 0.02, Math.min(1, relativeBottom + 0.008));
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

function QuestionCutEditor({
  photoUrl,
  group,
  questions,
  labels,
  selectedQuestionId,
  questionBands,
  onSelect,
  onChange,
}: {
  photoUrl: string;
  group: ReturnType<typeof pageGroups>[number];
  questions: PhotoQuestion[];
  labels: string[];
  selectedQuestionId: string;
  questionBands: Record<string, { top: number; bottom: number }>;
  onSelect: (questionId: string) => void;
  onChange: (questionId: string, band: { top: number; bottom: number }) => void;
}) {
  const question =
    group.questions.find((item) => item.id === selectedQuestionId) ?? group.questions[0];
  if (!question) return null;
  const sourceUrl = (question.imageUrls ?? []).find(
    (url) => pageKey(url) === group.key && parseSnipBand(url),
  );
  const automatic = sourceUrl ? parseSnipBand(sourceUrl) : null;
  if (!automatic) return null;
  const band = questionBands[question.id] ?? automatic;
  const update = (patch: Partial<typeof band>) => {
    const nextTop = Math.max(0, Math.min(patch.top ?? band.top, band.bottom - 0.02));
    const nextBottom = Math.min(1, Math.max(patch.bottom ?? band.bottom, nextTop + 0.02));
    onChange(question.id, { top: nextTop, bottom: nextBottom });
  };
  const index = questions.indexOf(question);

  return (
    <div className="mt-3 rounded-lg border p-3">
      <div className="mb-3 flex flex-wrap gap-2">
        {group.questions.map((item) => {
          const itemIndex = questions.indexOf(item);
          return (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={item.id === question.id ? "default" : "outline"}
              onClick={() => onSelect(item.id)}
            >
              Question {labels[itemIndex] ?? itemIndex + 1}
            </Button>
          );
        })}
      </div>
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex max-h-[58vh] justify-center overflow-hidden rounded-lg border bg-muted p-2">
          <div className="relative inline-block max-h-[56vh] max-w-full">
            <img
              src={photoUrl}
              alt="Trimmed completed paper page with the selected question cut highlighted"
              className="block max-h-[56vh] max-w-full object-contain"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 bg-foreground/45"
              style={{ height: `${band.top * 100}%` }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-foreground/45"
              style={{ height: `${(1 - band.bottom) * 100}%` }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 border-y-2 border-primary"
              style={{ top: `${band.top * 100}%`, height: `${(band.bottom - band.top) * 100}%` }}
            />
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <p className="font-medium">Question {labels[index] ?? index + 1}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Keep all of this answer inside the clear area. The shaded area will not be marked.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`photo-cut-top-${question.id}`}>
              Top edge
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Move top edge up"
                onClick={() => update({ top: band.top - 0.005 })}
              >
                <Minus className="size-3" />
              </Button>
              <Slider
                id={`photo-cut-top-${question.id}`}
                min={0}
                max={1000}
                value={[Math.round(band.top * 1000)]}
                onValueChange={(value) => update({ top: (value[0] ?? 0) / 1000 })}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Move top edge down"
                onClick={() => update({ top: band.top + 0.005 })}
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor={`photo-cut-bottom-${question.id}`}>
              Bottom edge
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Move bottom edge up"
                onClick={() => update({ bottom: band.bottom - 0.005 })}
              >
                <Minus className="size-3" />
              </Button>
              <Slider
                id={`photo-cut-bottom-${question.id}`}
                min={0}
                max={1000}
                value={[Math.round(band.bottom * 1000)]}
                onValueChange={(value) => update({ bottom: (value[0] ?? 1000) / 1000 })}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Move bottom edge down"
                onClick={() => update({ bottom: band.bottom + 0.005 })}
              >
                <Plus className="size-3" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Drag a slider for a large change or use − and + for a fine, line-by-line adjustment.
          </p>
        </div>
      </div>
    </div>
  );
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
  const [questionBands, setQuestionBands] = useState<
    Record<string, { top: number; bottom: number }>
  >({});
  const [trim, setTrim] = useState({ top: 0, bottom: 1 });
  const [adjusting, setAdjusting] = useState(false);
  const [detectingPage, setDetectingPage] = useState(false);
  const [marking, setMarking] = useState(false);
  const [localResults, setLocalResults] = useState<Record<string, PhotoResult>>({});
  const [recutQuestions, setRecutQuestions] = useState<Set<string>>(() => new Set());
  const [cropUrls, setCropUrls] = useState<Record<string, string>>({});
  const [selectedQuestionId, setSelectedQuestionId] = useState(questions[0]?.id ?? "");
  const questionRefs = useRef<Record<string, HTMLElement | null>>({});
  const uploadRef = useRef<HTMLDivElement | null>(null);
  const group = groups.find((item) => item.key === pageKeyValue) ?? groups[0];

  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );

  useEffect(() => {
    if (!photo || !group) {
      setCropUrls({});
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const next: Record<string, string> = {};
        for (const question of group.questions) {
          const sourceUrl = (question.imageUrls ?? []).find(
            (url) => pageKey(url) === group.key && parseSnipBand(url),
          );
          const automatic = sourceUrl ? parseSnipBand(sourceUrl) : null;
          if (!automatic) continue;
          const crop = await cropQuestion(
            photo,
            questionBands[question.id] ?? automatic,
            trim,
            `preview-${question.id}.jpg`,
          );
          next[question.id] = URL.createObjectURL(crop);
        }
        if (cancelled) {
          Object.values(next).forEach(URL.revokeObjectURL);
          return;
        }
        setCropUrls((current) => {
          Object.values(current).forEach(URL.revokeObjectURL);
          return next;
        });
      })();
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [photo, group, questionBands, trim]);

  useEffect(
    () => () => {
      Object.values(cropUrls).forEach(URL.revokeObjectURL);
    },
    [cropUrls],
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
        <p className="font-medium">Photo mode needs confirmed question cuts.</p>
        <p className="mt-2 text-muted-foreground">
          Ask the teacher to verify the question and mark-scheme cuts. They may come from separate
          documents or one mixed upload.
        </p>
      </div>
    );
  }

  const markPage = async () => {
    if (!photo || !group) return;
    const remaining = group.questions.filter(
      (question) => resultFor(question)?.verdict !== "correct" || recutQuestions.has(question.id),
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
        const crop = await cropQuestion(photo, questionBands[question.id] ?? band, filename);
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
        setRecutQuestions((current) => {
          const next = new Set(current);
          next.delete(question.id);
          return next;
        });
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
        <div ref={uploadRef} className="paper p-5">
          <h2 className="font-display text-xl">Photograph a completed paper page</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload any completed page from this homework. Photo mode matches it to the prepared
            question cuts automatically, and previously correct questions are never marked again.
          </p>
          {groups.length === 0 ? (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              The questions are listed below, but photos cannot be matched until the teacher
              confirms their question cuts.
            </div>
          ) : null}
          <div className="mt-4">
            <label className="block text-sm font-medium">
              Completed page photo
              <Input
                className="mt-1"
                type="file"
                accept="image/*,.heic,.heif"
                capture="environment"
                disabled={locked || groups.length === 0}
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (!selected) return;
                  void normalisePhotoFiles([selected]).then(async ([normalised]) => {
                    if (!normalised) return;
                    const ready = await trimPhotoToPage(normalised);
                    if (photoUrl) URL.revokeObjectURL(photoUrl);
                    setPhoto(ready);
                    setPhotoUrl(URL.createObjectURL(ready));
                    setDetectingPage(true);
                    void identifyPage(ready, groups)
                      .then((matchedKey) => {
                        if (!matchedKey) throw new Error("No matching paper page was found.");
                        setPageKeyValue(matchedKey);
                        const matched = groups.find((item) => item.key === matchedKey);
                        if (matched?.questions[0]) setSelectedQuestionId(matched.questions[0].id);
                      })
                      .catch(() => {
                        toast.error("This page could not be matched. Please try a clearer photo.");
                        setPhoto(null);
                        setPhotoUrl("");
                      })
                      .finally(() => setDetectingPage(false));
                  });
                }}
              />
            </label>
          </div>
          {photoUrl ? (
            <div className="mt-4">
              <p className="mb-2 text-sm text-muted-foreground" aria-live="polite">
                {detectingPage
                  ? "Matching this photo to the paper…"
                  : `Matched to ${group?.label ?? "a paper page"} · ${group?.questions.length ?? 0} question${group?.questions.length === 1 ? "" : "s"}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setAdjusting((value) => !value)}>
                  <Crop className="size-4" />
                  {adjusting ? "Finish adjusting cuts" : "Adjust question cuts"}
                </Button>
                <Button onClick={markPage} disabled={locked || marking || detectingPage}>
                  <ImageUp className="size-4" />
                  {detectingPage ? "Matching page…" : marking ? "Marking page…" : "Mark this page"}
                </Button>
              </div>
              {adjusting && group ? (
                <QuestionCutEditor
                  photoUrl={photoUrl}
                  group={group}
                  questions={questions}
                  labels={labels}
                  selectedQuestionId={selectedQuestionId}
                  questionBands={questionBands}
                  onSelect={setSelectedQuestionId}
                  onChange={(questionId, band) => {
                    setQuestionBands((current) => ({ ...current, [questionId]: band }));
                    setRecutQuestions((current) => new Set(current).add(questionId));
                  }}
                />
              ) : null}
              {adjusting ? (
                <div className="mt-3 space-y-4 rounded-lg border p-3">
                  <div className="relative overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={photoUrl}
                      alt="Completed full paper page for crop adjustment"
                      className="w-full"
                    />
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 bg-destructive/20"
                      style={{ height: `${trim.top * 100}%` }}
                    />
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 bg-destructive/20"
                      style={{ height: `${(1 - trim.bottom) * 100}%` }}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs">
                      Page top edge
                      <input
                        type="range"
                        min={0}
                        max={35}
                        value={Math.round(trim.top * 100)}
                        onChange={(event) => {
                          setTrim((current) => ({
                            ...current,
                            top: Math.min(current.bottom - 0.2, Number(event.target.value) / 100),
                          }));
                          setRecutQuestions(
                            (current) =>
                              new Set([
                                ...current,
                                ...(group?.questions.map((item) => item.id) ?? []),
                              ]),
                          );
                        }}
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
                        onChange={(event) => {
                          setTrim((current) => ({
                            ...current,
                            bottom: Math.max(current.top + 0.2, Number(event.target.value) / 100),
                          }));
                          setRecutQuestions(
                            (current) =>
                              new Set([
                                ...current,
                                ...(group?.questions.map((item) => item.id) ?? []),
                              ]),
                          );
                        }}
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
                            onChange={(event) => {
                              setQuestionBands((current) => ({
                                ...current,
                                [question.id]: {
                                  ...selectedBand,
                                  top: Math.min(
                                    selectedBand.bottom - 0.02,
                                    Number(event.target.value) / 100,
                                  ),
                                },
                              }));
                              setRecutQuestions((current) => new Set(current).add(question.id));
                            }}
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
                            onChange={(event) => {
                              setQuestionBands((current) => ({
                                ...current,
                                [question.id]: {
                                  ...selectedBand,
                                  bottom: Math.max(
                                    selectedBand.top + 0.02,
                                    Number(event.target.value) / 100,
                                  ),
                                },
                              }));
                              setRecutQuestions((current) => new Set(current).add(question.id));
                            }}
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

        {questions.map((question) => {
          const result = resultFor(question);
          const answer = answers.find((item) => item.question_id === question.id);
          const savedPhotos = (answer?.imageUrls ?? []).filter((url) =>
            url.includes(PHOTO_PAGE_FILE_PREFIX),
          );
          const currentCropUrl = cropUrls[question.id];
          const index = questions.indexOf(question);
          const showScheme =
            (markSchemeRevealed ||
              (revealOnFullMarks && result?.awardedMarks === question.marks)) &&
            Boolean(question.answerImageUrls?.length);
          return (
            <section
              key={question.id}
              ref={(node) => {
                questionRefs.current[question.id] = node;
              }}
              className={`paper scroll-mt-4 space-y-3 p-4 ${
                selectedQuestionId === question.id ? "ring-2 ring-primary/40" : ""
              }`}
            >
              <p className="font-medium">Question {labels[index] ?? index + 1}</p>
              {currentCropUrl ? (
                <img
                  src={currentCropUrl}
                  alt={`Extracted answer for question ${labels[index] ?? index + 1}`}
                  className="max-h-96 w-full rounded-lg border bg-white object-contain"
                />
              ) : savedPhotos.length ? (
                <QuestionSnipStack urls={savedPhotos} alt="Your photographed answer" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your answer will appear here after this page is marked.
                </p>
              )}
              {showScheme ? <CoveredScheme urls={question.answerImageUrls ?? []} /> : null}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <Badge>
                  {result?.awardedMarks ?? 0}/{question.marks}
                </Badge>
                {photo && group?.questions.some((item) => item.id === question.id) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedQuestionId(question.id);
                      setAdjusting(true);
                      uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    <Crop className="size-3.5" /> Adjust this cut
                  </Button>
                ) : null}
              </div>
              {result?.feedback ? <p className="text-sm">{result.feedback}</p> : null}
              <QuestionHelpButtons
                questionId={question.id}
                answerDraft="Photographed handwritten answer"
                allowHint={allowHint}
                allowSteps={allowSteps}
              />
            </section>
          );
        })}
      </div>

      <aside className="paper sticky top-4 p-3">
        <p className="font-display text-lg">All questions</p>
        <div className="mt-3 grid grid-cols-3 gap-1">
          {questions.map((question) => {
            const result = resultFor(question);
            const index = questions.indexOf(question);
            return (
              <Button
                type="button"
                size="sm"
                variant={selectedQuestionId === question.id ? "default" : "outline"}
                className="h-auto justify-start gap-1 px-2 py-1.5 text-xs"
                key={question.id}
                onClick={() => {
                  setSelectedQuestionId(question.id);
                  questionRefs.current[question.id]?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
              >
                {result?.verdict === "correct" ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : result?.verdict === "partial" ? (
                  <CircleDashed className="size-4 text-amber-500" />
                ) : result ? (
                  <XCircle className="size-4 text-destructive" />
                ) : null}
                Q{labels[index] ?? index + 1}
              </Button>
            );
          })}
        </div>
        {selectedQuestionId ? (
          <div className="mt-4 border-t pt-4">
            <p className="mb-2 text-sm font-medium">
              Help with Question{" "}
              {labels[questions.findIndex((item) => item.id === selectedQuestionId)]}
            </p>
            <QuestionHelpButtons
              questionId={selectedQuestionId}
              answerDraft="Photographed handwritten answer"
              allowHint={allowHint}
              allowSteps={allowSteps}
            />
          </div>
        ) : null}
      </aside>
    </div>
  );
}
