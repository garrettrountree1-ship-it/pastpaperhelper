import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  CircleDashed,
  Eraser,
  Minus,
  PenLine,
  Plus,
  Save,
  Type,
  Undo2,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { QuestionHelpButtons } from "@/components/assignments/QuestionHelpDialog";
import { PAD_FILE_NAME } from "@/components/assignments/DrawingPad";
import {
  mergeSnipPieces,
  parseSnipBand,
  QuestionSnipStack,
} from "@/components/assignments/QuestionSnip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { gradeAnswer, previewGradeAnswer } from "@/lib/app.functions";
import { questionPagesOnly } from "@/lib/answer-key";
import { NO_PASTE_MESSAGE } from "@/lib/integrity";
import { questionLabel } from "@/lib/question-label";

type Point = { x: number; y: number };
type Stroke = { color: string; width: number; points: Point[]; erase?: boolean };
type PaperTool = "pen" | "eraser" | "text";
type PaperQuestion = {
  id: string;
  position: number;
  question_text: string;
  marks: number;
  imageUrls?: string[];
  answerImageUrls?: string[];
  multipleChoice?: boolean;
  answerCheckMode?: "final-number" | "full-working" | null;
};
type PaperAnswer = {
  question_id: string;
  answer_text: string;
  image_paths?: string[] | null;
  /** Signed copies used by the teacher's live student-work view. */
  imageUrls?: string[];
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
  answerHeight,
  backgroundUrls,
  tool,
  color,
  questionContent,
  onTextChange,
  onSelect,
  registerExport,
  registerUndo,
}: {
  storageKey: string;
  initialText: string;
  disabled: boolean;
  lined: boolean;
  answerHeight: number;
  backgroundUrls: string[];
  tool: PaperTool;
  color: string;
  questionContent: ReactNode;
  onTextChange: (text: string) => void;
  onSelect: () => void;
  registerExport: (exporter: () => Promise<File>) => void;
  registerUndo: (undo: () => void) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [text, setText] = useState(initialText);
  const [height, setHeight] = useState(answerHeight);
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
      context.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.width;
      context.beginPath();
      stroke.points.forEach((point, index) =>
        index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
      );
      context.stroke();
    }
    context.globalCompositeOperation = "source-over";
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
      const height = Math.max(1, Math.ceil(wrap.scrollHeight));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    registerUndo(() => {
      strokes.current.pop();
      redraw();
      persist();
    });
    registerExport(async () => {
      const source = canvasRef.current;
      if (!source) throw new Error("The paper is not ready yet.");
      const output = document.createElement("canvas");
      output.width = source.width;
      output.height = source.height;
      const context = output.getContext("2d")!;
      context.fillStyle = "white";
      context.fillRect(0, 0, output.width, output.height);
      let imageY = 20;
      for (const url of mergeSnipPieces(questionPagesOnly(backgroundUrls))) {
        try {
          const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const loaded = new Image();
            loaded.crossOrigin = "anonymous";
            loaded.onload = () => resolve(loaded);
            loaded.onerror = () => reject(new Error("Question image could not be loaded."));
            loaded.src = url;
          });
          const band = parseSnipBand(url) ?? { top: 0, bottom: 1 };
          const sourceY = band.top * image.naturalHeight;
          const sourceHeight = Math.max(1, (band.bottom - band.top) * image.naturalHeight);
          const drawWidth = output.width - 40;
          const drawHeight = (drawWidth * sourceHeight) / image.naturalWidth;
          context.drawImage(
            image,
            0,
            sourceY,
            image.naturalWidth,
            sourceHeight,
            20,
            imageY,
            drawWidth,
            drawHeight,
          );
          imageY += drawHeight + 8;
        } catch {
          // The server still has the printed question text if an image cannot be embedded.
        }
      }
      context.drawImage(source, 0, 0);
      if (textRef.current.trim()) {
        context.fillStyle = "#111827";
        context.font = "18px sans-serif";
        const words = textRef.current.split(/\s+/);
        let line = "";
        let y = Math.max(30, output.height - height + 30);
        for (const word of words) {
          const candidate = `${line}${word} `;
          if (context.measureText(candidate).width > output.width - 48) {
            context.fillText(line, 24, y);
            line = `${word} `;
            y += 36;
          } else line = candidate;
        }
        context.fillText(line, 24, y);
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        output.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("Export failed."))),
          "image/png",
        ),
      );
      return new File([blob], PAD_FILE_NAME, { type: "image/png" });
    });
  }, [backgroundUrls, height, registerExport, registerUndo]);

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = height;
    const move = (moveEvent: PointerEvent) =>
      setHeight(Math.max(110, Math.min(900, startHeight + moveEvent.clientY - startY)));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    };
  };

  return (
    <div ref={wrapRef} className="relative bg-white" onPointerDown={onSelect} onFocus={onSelect}>
      <div className="relative z-0 p-5">{questionContent}</div>
      {height > 0 ? (
        <div
          className={`relative z-0 min-h-[110px] overflow-hidden px-6 ${
            lined
              ? "bg-[repeating-linear-gradient(to_bottom,white_0px,white_35px,#d1d5db_36px)]"
              : "bg-white"
          }`}
          style={{ height }}
        >
          <Textarea
            value={text}
            disabled={disabled}
            onChange={(event) => {
              setText(event.target.value);
              textRef.current = event.target.value;
              onTextChange(event.target.value);
              persist();
            }}
            onPaste={(event) => {
              event.preventDefault();
              toast.error(NO_PASTE_MESSAGE);
            }}
            onDrop={(event) => {
              event.preventDefault();
              toast.error(NO_PASTE_MESSAGE);
            }}
            placeholder={tool === "text" ? "Type on these lines…" : ""}
            className={`relative z-20 h-full min-h-0 resize-none border-0 bg-transparent px-0 py-1 text-base leading-9 shadow-none focus-visible:ring-0 ${
              tool === "text" ? "pointer-events-auto" : "pointer-events-none"
            }`}
          />
          <button
            type="button"
            className="absolute bottom-0 left-0 z-30 flex h-4 w-full cursor-ns-resize items-end justify-center bg-gradient-to-t from-muted/70 to-transparent"
            onPointerDown={startResize}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              setHeight((value) =>
                Math.max(110, Math.min(900, value + (event.key === "ArrowDown" ? 20 : -20))),
              );
            }}
            aria-label="Drag to change the answer space"
            title="Drag or use the arrow keys to change the answer space"
          >
            <span className="mb-1 h-1 w-16 rounded-full bg-muted-foreground/40" />
          </button>
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 z-10 h-full w-full touch-none ${
          tool === "text" ? "pointer-events-none" : "pointer-events-auto"
        }`}
        onPointerDown={(event) => {
          if (disabled || tool === "text") return;
          onSelect();
          event.currentTarget.setPointerCapture(event.pointerId);
          current.current = {
            color,
            width: tool === "eraser" ? 24 : 3,
            erase: tool === "eraser",
            points: [point(event)],
          };
          strokes.current.push(current.current);
        }}
        onPointerMove={(event) => {
          if (!current.current) return;
          current.current.points.push(point(event));
          redraw();
        }}
        onPointerUp={() => {
          current.current = null;
          persist();
        }}
        onPointerCancel={() => {
          current.current = null;
          persist();
        }}
      />
    </div>
  );
}

function PaperMarkScheme({ urls }: { urls: string[] }) {
  const [revealed, setRevealed] = useState(100);
  const frame = useRef<HTMLDivElement | null>(null);
  const revealAt = (clientY: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (rect) setRevealed(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)));
  };
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Mark scheme</p>
        <p className="text-right text-[11px] text-muted-foreground">Drag the cover or use ↑ ↓</p>
      </div>
      <div ref={frame} className="relative mt-2 overflow-hidden rounded-md">
        <QuestionSnipStack urls={urls} answers alt="Official mark scheme" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-card"
          style={{ height: `${100 - revealed}%` }}
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
            revealAt(event.clientY);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) revealAt(event.clientY);
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
  onMark: (question: PaperQuestion, text: string, file?: File) => Promise<PaperResult>;
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
  const undoers = useRef<Record<string, () => void>>({});
  const [marking, setMarking] = useState<string | null>(null);
  const [tool, setTool] = useState<PaperTool>("pen");
  const [color, setColor] = useState(COLORS[0]!);
  const [zoom, setZoom] = useState(1);
  const selectedQuestion = questions.find((question) => question.id === selected) ?? questions[0];
  const selectedResult = selectedQuestion ? results[selectedQuestion.id] : undefined;
  const selectedAnswer = selectedQuestion
    ? answers.find((answer) => answer.question_id === selectedQuestion.id)
    : undefined;

  const questionRefs = useRef<Record<string, HTMLElement | null>>({});
  return (
    <div className="relative grid items-start gap-4 pl-14 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="paper fixed left-2 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1 p-1.5 shadow-xl">
        <Button
          size="icon"
          variant={tool === "pen" ? "default" : "ghost"}
          onClick={() => setTool("pen")}
          title="Pen"
        >
          <PenLine className="size-4" />
        </Button>
        <Button
          size="icon"
          variant={tool === "text" ? "default" : "ghost"}
          onClick={() => setTool("text")}
          title="Type on the lines"
        >
          <Type className="size-4" />
        </Button>
        <Button
          size="icon"
          variant={tool === "eraser" ? "default" : "ghost"}
          onClick={() => setTool("eraser")}
          title="Eraser"
        >
          <Eraser className="size-4" />
        </Button>
        <div className="my-1 h-px w-full bg-border" />
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
          onClick={() => undoers.current[selected]?.()}
          title="Undo on selected question"
        >
          <Undo2 className="size-4" />
        </Button>
        <div className="my-1 h-px w-full bg-border" />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setZoom((value) => Math.max(0.65, value - 0.1))}
          title="Zoom out"
        >
          <Minus className="size-4" />
        </Button>
        <span className="text-[10px] font-medium">{Math.round(zoom * 100)}%</span>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setZoom((value) => Math.min(1.75, value + 0.1))}
          title="Zoom in"
        >
          <Plus className="size-4" />
        </Button>
        <span className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
          <Save className="size-3" />
        </span>
      </div>
      <div className="overflow-auto rounded-sm border bg-muted/30 shadow-sm">
        <div className="mx-auto origin-top bg-white" style={{ width: `${100 / zoom}%`, zoom }}>
          {questions.map((question, index) => {
            const result = results[question.id];
            const snips = question.imageUrls ?? [];
            const savedPaperUrls = locked
              ? (
                  answers.find((answer) => answer.question_id === question.id)?.imageUrls ?? []
                ).filter((url) => url.includes(PAD_FILE_NAME))
              : [];
            const multipleChoice = Boolean(question.multipleChoice);
            const needsBlank = /draw|diagram|graph|plot|sketch|calculate/i.test(
              question.question_text,
            );
            const answerHeight = multipleChoice || savedPaperUrls.length > 0 ? 0 : 220;
            const answerHeight = multipleChoice ? 0 : 220;
            const label = questionLabel(question.question_text, index);
            return (
              <section
                key={question.id}
                ref={(node) => {
                  questionRefs.current[question.id] = node;
                }}
                className="relative scroll-mt-20 border-b border-border/40 last:border-b-0"
              >
                <PaperAnswerArea
                  storageKey={`paper-mode:${assignmentId}:${question.id}`}
                  initialText={drafts[question.id] ?? ""}
                  disabled={locked || result?.verdict === "correct"}
                  lined={!needsBlank}
                  answerHeight={answerHeight}
                  backgroundUrls={savedPaperUrls.length > 0 ? [] : snips}
                  tool={tool}
                  color={color}
                  onSelect={() => setSelected(question.id)}
                  questionContent={
                    <>
                      <span className="absolute left-1 top-1 z-20 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        Q{label}
                      </span>
                      {savedPaperUrls.length > 0 ? (
                        <div>
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Student&apos;s marked paper
                          </p>
                          <QuestionSnipStack
                            urls={savedPaperUrls}
                            alt={`Student's answer for question ${label}`}
                          />
                        </div>
                      ) : snips.length ? (

                        <QuestionSnipStack urls={snips} alt={`Question ${label}`} />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{question.question_text}</p>
                      )}
                    </>
                  }
                  onTextChange={(text) =>
                    setDrafts((current) => ({ ...current, [question.id]: text }))
                  }
                  registerExport={(exporter) => {
                    exporters.current[question.id] = exporter;
                  }}
                  registerUndo={(undo) => {
                    undoers.current[question.id] = undo;
                  }}
                />
              </section>
            );
          })}
        </div>
      </div>

      <aside className="paper sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto p-3">
        <p className="font-display text-lg">Questions</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Select a block to mark it or ask for help.
        </p>
        <div className="grid grid-cols-4 gap-1 lg:grid-cols-3">
          {questions.map((question, index) => {
            const result = results[question.id];
            const label = questionLabel(question.question_text, index);
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
                {result?.verdict === "correct" ? (
                  <CheckCircle2 className="size-3.5" />
                ) : result?.verdict === "partial" ? (
                  <CircleDashed className="size-3.5 text-amber-500" />
                ) : result ? (
                  <XCircle className="size-3.5 text-destructive" />
                ) : null}{" "}
                Q{label}
              </Button>
            );
          })}
        </div>
        {selectedQuestion ? (
          <div className="mt-4 space-y-3 border-t pt-4">
            <p className="font-medium">
              Paper Q
              {questionLabel(selectedQuestion.question_text, questions.indexOf(selectedQuestion))} ·{" "}
              {selectedQuestion.marks} marks
            </p>
            {selectedQuestion.multipleChoice ||
            selectedQuestion.answerCheckMode === "final-number" ? (
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
                <p className="text-sm font-semibold">
                  {selectedQuestion.multipleChoice ? "Fast-mark choice" : "Fast-mark final answer"}
                </p>
                <p className="mb-2 text-xs text-muted-foreground">
                  {selectedQuestion.multipleChoice
                    ? "Enter A, B, C, D or E."
                    : "Enter the final number, including units where needed."}
                </p>
                <Input
                  value={drafts[selectedQuestion.id] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [selectedQuestion.id]: event.target.value,
                    }))
                  }
                  onPaste={(event) => {
                    event.preventDefault();
                    toast.error(NO_PASTE_MESSAGE);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    toast.error(NO_PASTE_MESSAGE);
                  }}
                  placeholder={selectedQuestion.multipleChoice ? "A–E" : "Final answer"}
                  disabled={locked || selectedResult?.verdict === "correct"}
                />
              </div>
            ) : null}
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
                  const draft = drafts[selectedQuestion.id] ?? "";
                  const result = await onMark(
                    selectedQuestion,
                    draft,
                    // Always include the rendered paper. A student may draw on a
                    // fast-mark question instead of (or as well as) typing.
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
              <PaperMarkScheme urls={selectedQuestion.answerImageUrls} />
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
        if (file) {
          const { error } = await supabase.storage
            .from("student-work")
            .upload(path, file, { contentType: "image/png", upsert: true });
          if (error) throw new Error(error.message);
        }
        const existingPaths =
          answers
            .find((answer) => answer.question_id === question.id)
            ?.image_paths?.filter((existing) => !existing.endsWith(PAD_FILE_NAME)) ?? [];
        const result = await grade({
          data: {
            assignmentId,
            questionId: question.id,
            answerText: text,
            imagePaths: file ? [...existingPaths, path].slice(-6) : [],
          },
        });
        await queryClient.refetchQueries({ queryKey, type: "active" });
        return result;
      }}
    />
  );
}

/** Teacher's read-only view of the same continuous paper and per-question credit. */
export function ReadOnlyPaperMode({
  assignmentId,
  questions,
  answers,
}: {
  assignmentId: string;
  questions: PaperQuestion[];
  answers: PaperAnswer[];
}) {
  return (
    <ContinuousPaper
      assignmentId={`teacher:${assignmentId}`}
      questions={questions}
      answers={answers}
      locked
      allowHint={false}
      allowSteps={false}
      revealOnFullMarks={false}
      // The server only sends answer images that this student is entitled to
      // see. Mirroring that payload lets the teacher's student view show the
      // exact same released mark-scheme block instead of hiding it again.
      markSchemeRevealed={questions.some((question) => question.answerImageUrls?.length)}
      onMark={async () => {
        throw new Error("This student view is read-only.");
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
        const dataUrl = file
          ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error("Could not read the paper."));
              reader.readAsDataURL(file);
            })
          : null;
        return previewGradeAnswer({
          data: {
            assignmentId,
            questionId: question.id,
            answerText: text,
            imageDataUrls: [],
            padDataUrls: dataUrl ? [dataUrl] : [],
            priorFlags: 0,
          },
        });
      }}
    />
  );
}
