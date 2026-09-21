import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Eraser, PenLine, Save, Type, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { QuestionHelpButtons } from "@/components/assignments/QuestionHelpDialog";
import { PAD_FILE_NAME } from "@/components/assignments/DrawingPad";
import { QuestionSnipStack } from "@/components/assignments/QuestionSnip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { gradeAnswer, previewGradeAnswer } from "@/lib/app.functions";
import { resolveQuestionLabels } from "@/lib/question-label";

type Point = { x: number; y: number };
type Stroke = { color: string; width: number; points: Point[] };
type PaperQuestion = {
  id: string;
  position: number;
  question_text: string;
  marks: number;
  imageUrls?: string[];
  answerImageUrls?: string[];
};
type PaperAnswer = {
  question_id: string;
  answer_text: string;
  image_paths?: string[] | null;
  verdict?: string | null;
  awarded_marks?: number | null;
  feedback?: string | null;
  attempts?: number;
};
type PaperResult = { verdict: string; awardedMarks: number; feedback: string };

const COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a", "#7c3aed", "#ea580c"];

function PaperAnswerArea({
  storageKey,
  initialText,
  disabled,
  lined,
  onTextChange,
  registerExport,
}: {
  storageKey: string;
  initialText: string;
  disabled: boolean;
  lined: boolean;
  onTextChange: (text: string) => void;
  registerExport: (exporter: () => Promise<File>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const touchPointers = useRef(new Set<number>());
  const multiTouch = useRef(false);
  const [color, setColor] = useState(COLORS[0]!);
  const [tool, setTool] = useState<"pen" | "eraser" | "text">("pen");
  const [text, setText] = useState(initialText);
  const textRef = useRef(text);
  textRef.current = text;

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of strokes.current) {
      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.width;
      context.beginPath();
      stroke.points.forEach((point, index) =>
        index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
      );
      context.stroke();
    }
  };

  const persist = () => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ strokes: strokes.current, text: textRef.current }),
      );
    } catch {
      // The work remains in memory if browser storage is unavailable.
    }
  };

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { strokes?: Stroke[]; text?: string };
        strokes.current = parsed.strokes ?? [];
        if (typeof parsed.text === "string") {
          setText(parsed.text);
          onTextChange(parsed.text);
        }
      }
    } catch {
      // Start with a clean sheet when a local draft cannot be read.
    }
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const resize = () => {
      const width = Math.max(320, Math.floor(wrap.clientWidth));
      if (canvas.width === width && canvas.height === 440) return;
      canvas.width = width;
      canvas.height = 440;
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    registerExport(async () => {
      const source = canvasRef.current;
      if (!source) throw new Error("The paper is not ready yet.");
      const output = document.createElement("canvas");
      output.width = source.width;
      output.height = source.height;
      const context = output.getContext("2d")!;
      context.fillStyle = "white";
      context.fillRect(0, 0, output.width, output.height);
      if (lined) {
        context.strokeStyle = "#d1d5db";
        context.lineWidth = 1;
        for (let y = 44; y < output.height; y += 36) {
          context.beginPath();
          context.moveTo(20, y);
          context.lineTo(output.width - 20, y);
          context.stroke();
        }
      }
      context.drawImage(source, 0, 0);
      if (text.trim()) {
        context.fillStyle = "#111827";
        context.font = "18px sans-serif";
        const words = text.split(/\s+/);
        let line = "";
        let y = 30;
        for (const word of words) {
          const candidate = `${line}${word} `;
          if (context.measureText(candidate).width > output.width - 40) {
            context.fillText(line, 20, y);
            line = `${word} `;
            y += 28;
          } else line = candidate;
        }
        context.fillText(line, 20, y);
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        output.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("Export failed."))),
          "image/png",
        ),
      );
      return new File([blob], PAD_FILE_NAME, { type: "image/png" });
    });
  }, [lined, registerExport, text]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    };
  };

  return (
    <div ref={wrapRef} className="relative border-t bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b bg-background/95 p-2">
        <Button
          size="sm"
          variant={tool === "pen" ? "default" : "ghost"}
          onClick={() => setTool("pen")}
          disabled={disabled}
        >
          <PenLine className="size-4" /> Pen
        </Button>
        <Button
          size="sm"
          variant={tool === "text" ? "default" : "ghost"}
          onClick={() => setTool("text")}
          disabled={disabled}
        >
          <Type className="size-4" /> Type
        </Button>
        <Button
          size="sm"
          variant={tool === "eraser" ? "default" : "ghost"}
          onClick={() => setTool("eraser")}
          disabled={disabled}
        >
          <Eraser className="size-4" /> Eraser
        </Button>
        {COLORS.map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`Pen colour ${value}`}
            onClick={() => {
              setColor(value);
              setTool("pen");
            }}
            className={`size-6 rounded-full border-2 ${color === value && tool === "pen" ? "border-primary" : "border-white"}`}
            style={{ backgroundColor: value }}
          />
        ))}
        <Button
          size="icon"
          variant="ghost"
          disabled={disabled || strokes.current.length === 0}
          onClick={() => {
            strokes.current.pop();
            redraw();
            persist();
          }}
        >
          <Undo2 className="size-4" />
        </Button>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Save className="size-3" /> Autosaved on this device
        </span>
      </div>
      {tool === "text" ? (
        <Textarea
          value={text}
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
            onTextChange(event.target.value);
            window.setTimeout(persist, 0);
          }}
          placeholder="Type anywhere in this answer area…"
          className="absolute inset-x-4 top-16 z-[5] min-h-40 resize-y bg-white/90 text-base"
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className={`block h-[440px] w-full ${lined ? "bg-[repeating-linear-gradient(to_bottom,white_0px,white_35px,#d1d5db_36px)]" : "bg-white"}`}
        style={{ touchAction: "pinch-zoom" }}
        onPointerDown={(event) => {
          if (disabled || tool === "text") return;
          if (event.pointerType === "touch") {
            touchPointers.current.add(event.pointerId);
            if (touchPointers.current.size > 1) {
              multiTouch.current = true;
              if (current.current)
                strokes.current = strokes.current.filter((s) => s !== current.current);
              current.current = null;
              redraw();
              return;
            }
            if (multiTouch.current) return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          current.current = {
            color: tool === "eraser" ? "#ffffff" : color,
            width: tool === "eraser" ? 24 : 3,
            points: [point(event)],
          };
          strokes.current.push(current.current);
        }}
        onPointerMove={(event) => {
          if (multiTouch.current) return;
          if (!current.current) return;
          current.current.points.push(point(event));
          redraw();
        }}
        onPointerUp={(event) => {
          if (event.pointerType === "touch") {
            touchPointers.current.delete(event.pointerId);
            if (touchPointers.current.size === 0) multiTouch.current = false;
          }
          current.current = null;
          persist();
        }}
        onPointerCancel={(event) => {
          if (event.pointerType === "touch") {
            touchPointers.current.delete(event.pointerId);
            if (touchPointers.current.size === 0) multiTouch.current = false;
          }
          current.current = null;
          persist();
        }}
        onTouchStart={(event) => {
          if (event.touches.length < 2) return;
          multiTouch.current = true;
          if (current.current)
            strokes.current = strokes.current.filter((s) => s !== current.current);
          current.current = null;
          redraw();
        }}
      />
    </div>
  );
}

function ContinuousPaper({
  assignmentId,
  questions,
  answers,
  locked,
  allowHint,
  allowSteps,
  revealOnFullMarks,
  markSchemeRevealed,
  onMark,
}: {
  assignmentId: string;
  questions: PaperQuestion[];
  answers: PaperAnswer[];
  locked: boolean;
  allowHint: boolean;
  allowSteps: boolean;
  revealOnFullMarks: boolean;
  markSchemeRevealed: boolean;
  onMark: (question: PaperQuestion, text: string, file: File) => Promise<PaperResult>;
}) {
  const [selected, setSelected] = useState(questions[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(answers.map((answer) => [answer.question_id, answer.answer_text ?? ""])),
  );
  const [results, setResults] = useState<Record<string, PaperResult>>(() =>
    Object.fromEntries(
      answers
        .filter((answer) => answer.verdict)
        .map((answer) => [
          answer.question_id,
          {
            verdict: answer.verdict!,
            awardedMarks: answer.awarded_marks ?? 0,
            feedback: answer.feedback ?? "",
          },
        ]),
    ),
  );
  const exporters = useRef<Record<string, () => Promise<File>>>({});
  const [marking, setMarking] = useState<string | null>(null);
  const selectedQuestion = questions.find((question) => question.id === selected) ?? questions[0];
  const selectedResult = selectedQuestion ? results[selectedQuestion.id] : undefined;
  const selectedAnswer = selectedQuestion
    ? answers.find((answer) => answer.question_id === selectedQuestion.id)
    : undefined;

  const questionRefs = useRef<Record<string, HTMLElement | null>>({});
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        {questions.map((question, index) => {
          const result = results[question.id];
          const snips = question.imageUrls ?? [];
          const lined = !/draw|diagram|graph|plot|sketch|calculate/i.test(question.question_text);
          return (
            <section
              key={question.id}
              ref={(node) => {
                questionRefs.current[question.id] = node;
              }}
              className="scroll-mt-20 border-b-8 border-muted last:border-b-0"
            >
              <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
                <Badge>Paper Q{index + 1}</Badge>
                <span className="text-xs text-muted-foreground">
                  Printed label:{" "}
                  {resolveQuestionLabels(questions.map((q) => q.question_text))[index]}
                </span>
                <Badge variant="outline" className="ml-auto">
                  {result ? `${result.awardedMarks}/` : ""}
                  {question.marks} marks
                </Badge>
              </div>
              <div className="p-4">
                {snips.length ? (
                  <QuestionSnipStack urls={snips} alt={`Question ${index + 1}`} />
                ) : (
                  <p className="whitespace-pre-wrap text-sm">{question.question_text}</p>
                )}
              </div>
              <PaperAnswerArea
                storageKey={`paper-mode:${assignmentId}:${question.id}`}
                initialText={drafts[question.id] ?? ""}
                disabled={locked || result?.verdict === "correct"}
                lined={lined}
                onTextChange={(text) =>
                  setDrafts((current) => ({ ...current, [question.id]: text }))
                }
                registerExport={(exporter) => {
                  exporters.current[question.id] = exporter;
                }}
              />
            </section>
          );
        })}
      </div>

      <aside className="paper sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto p-3">
        <p className="font-display text-lg">Questions</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Select a block to mark it or ask for help.
        </p>
        <div className="grid grid-cols-4 gap-1 lg:grid-cols-3">
          {questions.map((question, index) => {
            const result = results[question.id];
            return (
              <Button
                key={question.id}
                size="sm"
                variant={selected === question.id ? "default" : "outline"}
                onClick={() => {
                  setSelected(question.id);
                  questionRefs.current[question.id]?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
              >
                {result?.verdict === "correct" ? <CheckCircle2 className="size-3.5" /> : null} Q
                {index + 1}
              </Button>
            );
          })}
        </div>
        {selectedQuestion ? (
          <div className="mt-4 space-y-3 border-t pt-4">
            <p className="font-medium">
              Paper Q{questions.indexOf(selectedQuestion) + 1} · {selectedQuestion.marks} marks
            </p>
            {selectedResult ? (
              <div className="rounded-lg border p-3 text-sm">
                <Badge>
                  {selectedResult.awardedMarks}/{selectedQuestion.marks}
                </Badge>
                <p className="mt-2">{selectedResult.feedback}</p>
              </div>
            ) : null}
            <Button
              className="w-full"
              disabled={
                locked || marking === selectedQuestion.id || selectedResult?.verdict === "correct"
              }
              onClick={async () => {
                const exporter = exporters.current[selectedQuestion.id];
                if (!exporter) return;
                setMarking(selectedQuestion.id);
                try {
                  const result = await onMark(
                    selectedQuestion,
                    drafts[selectedQuestion.id] ?? "",
                    await exporter(),
                  );
                  setResults((current) => ({ ...current, [selectedQuestion.id]: result }));
                } catch (error) {
                  toast.error((error as Error).message);
                } finally {
                  setMarking(null);
                }
              }}
            >
              {marking === selectedQuestion.id
                ? "Marking…"
                : selectedResult?.verdict === "correct"
                  ? "Correct"
                  : "Mark this question"}
            </Button>
            <QuestionHelpButtons
              questionId={selectedQuestion.id}
              answerDraft={drafts[selectedQuestion.id] ?? ""}
              allowHint={allowHint}
              allowSteps={allowSteps}
            />
            {(markSchemeRevealed ||
              (revealOnFullMarks && selectedResult?.awardedMarks === selectedQuestion.marks)) &&
            selectedQuestion.answerImageUrls?.length ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="mb-2 text-sm font-medium">Mark scheme</p>
                <QuestionSnipStack
                  urls={selectedQuestion.answerImageUrls}
                  answers
                  alt="Official mark scheme"
                />
              </div>
            ) : null}
            {selectedAnswer?.attempts ? (
              <p className="text-xs text-muted-foreground">
                {selectedAnswer.attempts} previous attempt{selectedAnswer.attempts === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export function StudentPaperMode({
  assignmentId,
  questions,
  answers,
  locked,
  settings,
  revealOnFullMarks,
  markSchemeRevealed,
  queryKey,
}: {
  assignmentId: string;
  questions: PaperQuestion[];
  answers: PaperAnswer[];
  locked: boolean;
  settings: { allowHint?: boolean; allowSteps?: boolean } | undefined;
  revealOnFullMarks: boolean;
  markSchemeRevealed: boolean;
  queryKey: string[];
}) {
  const grade = useServerFn(gradeAnswer);
  const queryClient = useQueryClient();
  return (
    <ContinuousPaper
      assignmentId={assignmentId}
      questions={questions}
      answers={answers}
      locked={locked}
      allowHint={settings?.allowHint !== false}
      allowSteps={settings?.allowSteps !== false}
      revealOnFullMarks={revealOnFullMarks}
      markSchemeRevealed={markSchemeRevealed}
      onMark={async (question, text, file) => {
        const { data } = await supabase.auth.getUser();
        if (!data.user) throw new Error("Please sign in again.");
        const path = `${data.user.id}/${assignmentId}/${question.id}/${PAD_FILE_NAME}`;
        const { error } = await supabase.storage
          .from("student-work")
          .upload(path, file, { contentType: "image/png", upsert: true });
        if (error) throw new Error(error.message);
        const existingPaths =
          answers
            .find((answer) => answer.question_id === question.id)
            ?.image_paths?.filter((existing) => !existing.endsWith(PAD_FILE_NAME)) ?? [];
        const result = await grade({
          data: {
            assignmentId,
            questionId: question.id,
            answerText: text,
            imagePaths: [...existingPaths, path].slice(-6),
          },
        });
        await queryClient.refetchQueries({ queryKey, type: "active" });
        return result;
      }}
    />
  );
}

export function PreviewPaperMode({
  assignmentId,
  questions,
  settings,
  revealOnFullMarks,
  markSchemeRevealed,
}: {
  assignmentId: string;
  questions: PaperQuestion[];
  settings: { allowHint?: boolean; allowSteps?: boolean } | undefined;
  revealOnFullMarks: boolean;
  markSchemeRevealed: boolean;
}) {
  const [answers] = useState<PaperAnswer[]>([]);
  return (
    <ContinuousPaper
      assignmentId={`preview:${assignmentId}`}
      questions={questions}
      answers={answers}
      locked={false}
      allowHint={settings?.allowHint !== false}
      allowSteps={settings?.allowSteps !== false}
      revealOnFullMarks={revealOnFullMarks}
      markSchemeRevealed={markSchemeRevealed}
      onMark={async (question, text, file) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read the paper."));
          reader.readAsDataURL(file);
        });
        return previewGradeAnswer({
          data: {
            assignmentId,
            questionId: question.id,
            answerText: text,
            imageDataUrls: [],
            padDataUrls: [dataUrl],
            priorFlags: 0,
          },
        });
      }}
    />
  );
}
