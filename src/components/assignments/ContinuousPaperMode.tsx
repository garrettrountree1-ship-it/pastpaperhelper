import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  CircleDashed,
  Eraser,
  Eye,
  EyeOff,
  Minus,
  Move,
  PenLine,
  Plus,
  Save,
  TextCursorInput,
  Trash2,
  Type,
  Undo2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  HELP_PILL,
  HELP_PILL_DOT,
  HELP_PILL_LABEL,
  QuestionHelpButtons,
  TeacherIcon,
} from "@/components/assignments/QuestionHelpDialog";
import { PAD_FILE_NAME } from "@/components/assignments/DrawingPad";
import { MessageTeacherDialog } from "@/components/messaging/MessageTeacherDialog";
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
import { COVERED_MARK_SCHEME_PERCENT } from "@/lib/mark-scheme-reveal";
import { resolveQuestionLabels } from "@/lib/question-label";

type Point = { x: number; y: number };
type Stroke = { color: string; width: number; points: Point[]; erase?: boolean };
type PaperTool = "pen" | "eraser" | "text" | "textbox";
type PaperTextBox = {
  id: string;
  x: number;
  y: number;
  text: string;
  width?: number;
  height?: number;
};
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
type PaperResult = {
  verdict: string;
  awardedMarks: number;
  feedback: string;
  leadingQuestion?: string;
};

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
  registerClear,
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
  /** Wipes every stroke, text box and typed line for this question. */
  registerClear: (clear: () => void) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [text, setText] = useState(initialText);
  const [height, setHeight] = useState(answerHeight);
  const [textBoxes, setTextBoxes] = useState<PaperTextBox[]>([]);
  // Text boxes are stored in the drawing's own coordinates, so where the student
  // drops them is exactly where they appear in the marked picture.
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const textBoxesRef = useRef(textBoxes);
  textBoxesRef.current = textBoxes;
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
        JSON.stringify({
          strokes: strokes.current,
          text: textRef.current,
          textBoxes: textBoxesRef.current,
        }),
      );
    } catch {
      // The work remains in memory if browser storage is unavailable.
    }
  };

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          strokes?: Stroke[];
          text?: string;
          textBoxes?: PaperTextBox[];
        };
        strokes.current = parsed.strokes ?? [];
        setTextBoxes(parsed.textBoxes ?? []);
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
      setCanvasSize({ width, height });
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
    registerClear(() => {
      strokes.current = [];
      current.current = null;
      setTextBoxes([]);
      textBoxesRef.current = [];
      setText("");
      textRef.current = "";
      onTextChange("");
      redraw();
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Nothing to clean up when browser storage is unavailable.
      }
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
      context.fillStyle = "#111827";
      context.font = "18px sans-serif";
      // Everything the student put on this question — pen strokes, typed lines and
      // every placed text box — is drawn into the one picture that gets marked.
      for (const box of textBoxesRef.current) {
        const maxWidth = Math.max(
          80,
          Math.min(box.width ?? output.width, output.width - box.x - 24),
        );
        let y = box.y + 24;
        for (const paragraph of box.text.split(/\n/)) {
          let line = "";
          for (const word of paragraph.split(/\s+/)) {
            const candidate = `${line}${word} `;
            if (line && context.measureText(candidate).width > maxWidth) {
              context.fillText(line, box.x + 8, y);
              line = `${word} `;
              y += 24;
            } else line = candidate;
          }
          context.fillText(line, box.x + 8, y);
          y += 24;
        }
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundUrls, height, registerExport, registerUndo, registerClear]);

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
          if (tool === "textbox") {
            const location = point(event);
            setTextBoxes((currentBoxes) => [
              ...currentBoxes,
              { id: crypto.randomUUID(), x: location.x, y: location.y, text: "" },
            ]);
            window.setTimeout(persist);
            return;
          }
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
      {textBoxes.map((box) => (
        <div
          key={box.id}
          className="absolute z-20 flex items-stretch rounded-md border bg-white/95 shadow-sm"
          style={{
            left: `${(box.x / Math.max(1, canvasSize.width)) * 100}%`,
            top: `${(box.y / Math.max(1, canvasSize.height)) * 100}%`,
            width: `${((box.width ?? 260) / Math.max(1, canvasSize.width)) * 100}%`,
            height: `${((box.height ?? 84) / Math.max(1, canvasSize.height)) * 100}%`,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="touch-none cursor-move p-2 text-muted-foreground"
            aria-label="Move text box"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              const rect = canvasRef.current?.getBoundingClientRect();
              const scaleX = rect ? canvasSize.width / Math.max(1, rect.width) : 1;
              const scaleY = rect ? canvasSize.height / Math.max(1, rect.height) : 1;
              const origin = { x: event.clientX, y: event.clientY, boxX: box.x, boxY: box.y };
              const moveBox = (moveEvent: PointerEvent) =>
                setTextBoxes((currentBoxes) =>
                  currentBoxes.map((item) =>
                    item.id === box.id
                      ? {
                          ...item,
                          x: Math.max(0, origin.boxX + (moveEvent.clientX - origin.x) * scaleX),
                          y: Math.max(0, origin.boxY + (moveEvent.clientY - origin.y) * scaleY),
                        }
                      : item,
                  ),
                );
              const finish = () => {
                window.removeEventListener("pointermove", moveBox);
                window.removeEventListener("pointerup", finish);
                persist();
              };
              window.addEventListener("pointermove", moveBox);
              window.addEventListener("pointerup", finish);
            }}
          >
            <Move className="size-4" />
          </button>
          <Textarea
            autoFocus={!box.text}
            value={box.text}
            disabled={disabled}
            rows={1}
            aria-label="Movable answer text"
            className="h-full min-h-9 flex-1 resize-none border-0 px-1 py-2 shadow-none focus-visible:ring-0"
            onPaste={(event) => {
              event.preventDefault();
              toast.error(NO_PASTE_MESSAGE);
            }}
            onChange={(event) =>
              setTextBoxes((currentBoxes) =>
                currentBoxes.map((item) =>
                  item.id === box.id ? { ...item, text: event.target.value } : item,
                ),
              )
            }
            onBlur={persist}
          />
          <button
            type="button"
            className="p-2 text-muted-foreground hover:text-destructive"
            aria-label="Delete text box"
            disabled={disabled}
            onClick={() => {
              setTextBoxes((currentBoxes) => currentBoxes.filter((item) => item.id !== box.id));
              window.setTimeout(persist);
            }}
          >
            <Trash2 className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Drag the corner to resize this text box"
            title="Drag the corner to resize this text box"
            disabled={disabled}
            className="absolute -bottom-1 -right-1 size-4 cursor-nwse-resize touch-none rounded-sm border border-primary/60 bg-primary/30"
            onPointerDown={(event) => {
              if (disabled) return;
              event.preventDefault();
              event.stopPropagation();
              const rect = canvasRef.current?.getBoundingClientRect();
              const scaleX = rect ? canvasSize.width / Math.max(1, rect.width) : 1;
              const scaleY = rect ? canvasSize.height / Math.max(1, rect.height) : 1;
              const origin = {
                x: event.clientX,
                y: event.clientY,
                width: box.width ?? 260,
                height: box.height ?? 84,
              };
              const resize = (moveEvent: PointerEvent) =>
                setTextBoxes((currentBoxes) =>
                  currentBoxes.map((item) =>
                    item.id === box.id
                      ? {
                          ...item,
                          width: Math.max(
                            120,
                            origin.width + (moveEvent.clientX - origin.x) * scaleX,
                          ),
                          height: Math.max(
                            48,
                            origin.height + (moveEvent.clientY - origin.y) * scaleY,
                          ),
                        }
                      : item,
                  ),
                );
              const finish = () => {
                window.removeEventListener("pointermove", resize);
                window.removeEventListener("pointerup", finish);
                persist();
              };
              window.addEventListener("pointermove", resize);
              window.addEventListener("pointerup", finish);
            }}
          />
        </div>
      ))}
    </div>
  );
}

function PaperMarkScheme({ urls }: { urls: string[] }) {
  const [revealed, setRevealed] = useState(COVERED_MARK_SCHEME_PERCENT);
  const frame = useRef<HTMLDivElement | null>(null);
  const revealAt = (clientY: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (rect) setRevealed(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)));
  };
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Mark scheme</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setRevealed(COVERED_MARK_SCHEME_PERCENT)}
          >
            <EyeOff className="size-3.5" /> Cover
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setRevealed(100)}
          >
            <Eye className="size-3.5" /> Uncover
          </Button>
        </div>
      </div>
      <div className="flex justify-end">
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
  teacherMessage,
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
  teacherMessage?: { classId: string; className: string; assignmentTitle: string };
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
  // Marks saved on the server always win, so a question marked in question mode
  // shows its score (and its released answer) here too, and the other way round.
  useEffect(() => {
    setResults((current) => {
      const merged = { ...current };
      for (const answer of answers) {
        if (!answer.verdict) continue;
        merged[answer.question_id] = {
          verdict: answer.verdict,
          awardedMarks: Number(answer.awarded_marks ?? 0),
          feedback: answer.feedback ?? "",
        };
      }
      return merged;
    });
  }, [answers]);
  const exporters = useRef<Record<string, () => Promise<File>>>({});
  const undoers = useRef<Record<string, () => void>>({});
  const clearers = useRef<Record<string, () => void>>({});
  const [marking, setMarking] = useState<string | null>(null);
  const [tool, setTool] = useState<PaperTool>("pen");
  const [color, setColor] = useState(COLORS[0]!);
  const [zoom, setZoom] = useState(1);
  // Keep this local safeguard as well as the route-level protection: paper mode
  // is also rendered by preview and read-only teacher/student views.
  const [windowConcealed, setWindowConcealed] = useState(false);
  useEffect(() => {
    const conceal = () => setWindowConcealed(true);
    const reveal = () => setWindowConcealed(false);
    const onVisibility = () => setWindowConcealed(document.hidden);
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", reveal);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", reveal);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  // Every view of a paper shows the paper's own numbering (1a, 1b, 1b(ii) …).
  const labels = useMemo(
    () => resolveQuestionLabels(questions.map((question) => question.question_text)),
    [questions],
  );
  const selectedQuestion = questions.find((question) => question.id === selected) ?? questions[0];
  const selectedResult = selectedQuestion ? results[selectedQuestion.id] : undefined;
  const selectedAnswer = selectedQuestion
    ? answers.find((answer) => answer.question_id === selectedQuestion.id)
    : undefined;

  const questionRefs = useRef<Record<string, HTMLElement | null>>({});
  return (
    <div
      className={`relative grid items-start gap-4 pl-14 transition-[filter] lg:grid-cols-[minmax(0,1fr)_19rem] ${
        windowConcealed ? "pointer-events-none select-none blur-lg" : ""
      }`}
    >
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
          variant={tool === "textbox" ? "default" : "ghost"}
          onClick={() => setTool("textbox")}
          title="Place a movable text box"
        >
          <TextCursorInput className="size-4" />
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

            const label = labels[index] ?? String(index + 1);
            const fullCredit =
              Number(question.marks) > 0 &&
              Number(result?.awardedMarks ?? 0) >= Number(question.marks);
            const showAnswerHere =
              (markSchemeRevealed || (revealOnFullMarks && fullCredit)) &&
              (question.answerImageUrls?.length ?? 0) > 0;
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
                  registerClear={(clear) => {
                    clearers.current[question.id] = clear;
                  }}
                />
                {showAnswerHere ? (
                  <div className="border-t bg-primary/5 p-4">
                    <PaperMarkScheme urls={question.answerImageUrls ?? []} />
                  </div>
                ) : null}
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
            const label = labels[index] ?? String(index + 1);
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
                  <CheckCircle2 className="size-3.5 text-emerald-600" aria-label="Full credit" />
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
              {labels[questions.indexOf(selectedQuestion)] ??
                questions.indexOf(selectedQuestion) + 1}{" "}
              · {selectedQuestion.marks} marks
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
              <div className="space-y-2">
                <div className="rounded-lg border p-3 text-sm">
                  <Badge>
                    {selectedResult.awardedMarks}/{selectedQuestion.marks}
                  </Badge>
                  {selectedResult.verdict === "correct" && selectedResult.feedback ? (
                    <p className="mt-2">{selectedResult.feedback}</p>
                  ) : null}
                </div>
                {selectedResult.verdict !== "correct" ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <span aria-hidden="true" className="text-primary">
                        ✨
                      </span>{" "}
                      AI tutor
                    </p>
                    <p className="mt-2 whitespace-pre-wrap">
                      {selectedResult.leadingQuestion || selectedResult.feedback}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Use a hint or step-by-step help below, then improve your work and mark it
                      again.
                    </p>
                  </div>
                ) : null}
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
                  // A correct fast answer settles the question, so the rough
                  // working and sketching for it is wiped from the paper.
                  const fastMark =
                    selectedQuestion.multipleChoice ||
                    selectedQuestion.answerCheckMode === "final-number";
                  const answeredWithFastField = fastMark && Boolean(draft.trim());
                  if (answeredWithFastField && result.verdict === "correct") {
                    clearers.current[selectedQuestion.id]?.();
                    setDrafts((current) => ({ ...current, [selectedQuestion.id]: "" }));
                  }
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
            {teacherMessage ? (
              <MessageTeacherDialog
                classId={teacherMessage.classId}
                className={teacherMessage.className}
                preset={{
                  assignmentId,
                  questionId: selectedQuestion.id,
                  topic: `${teacherMessage.assignmentTitle} · Question ${
                    labels[questions.indexOf(selectedQuestion)] ??
                    questions.indexOf(selectedQuestion) + 1
                  }`,
                }}
                trigger={
                  <button
                    type="button"
                    title="Ask the teacher"
                    aria-label="Ask the teacher"
                    className={`${HELP_PILL} w-full border-primary/50 bg-primary/10 hover:bg-primary/20`}
                  >
                    <span className={`${HELP_PILL_DOT} bg-primary text-primary-foreground`}>
                      <TeacherIcon className="size-3.5" />
                    </span>
                    <span className={`${HELP_PILL_LABEL} text-foreground`}>Ask the teacher</span>
                  </button>
                }
              />
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
  classId,
  className,
  assignmentTitle,
}: {
  assignmentId: string;
  questions: PaperQuestion[];
  answers: PaperAnswer[];
  locked: boolean;
  settings: { allowHint?: boolean; allowSteps?: boolean } | undefined;
  revealOnFullMarks: boolean;
  markSchemeRevealed: boolean;
  queryKey: string[];
  classId: string;
  className: string;
  assignmentTitle: string;
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
      teacherMessage={{ classId, className, assignmentTitle }}
      onMark={async (question, text, file) => {
        const { data } = await supabase.auth.getUser();
        if (!data.user) throw new Error("Please sign in again.");
        const path = `${data.user.id}/${assignmentId}/${question.id}/${PAD_FILE_NAME}`;
        const useFastAnswer =
          Boolean(text.trim()) &&
          (Boolean(question.multipleChoice) || question.answerCheckMode === "final-number");
        if (file && !useFastAnswer) {
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
            // A completed fast-answer field is authoritative. Only use the
            // rendered sketch when that field is empty.
            imagePaths: file && !useFastAnswer ? [...existingPaths, path].slice(-6) : [],
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
  answers = [],
  onResult,
}: {
  assignmentId: string;
  questions: PaperQuestion[];
  settings: { allowHint?: boolean; allowSteps?: boolean } | undefined;
  revealOnFullMarks: boolean;
  markSchemeRevealed: boolean;
  /** Marks already earned in the other view of this same test session. */
  answers?: PaperAnswer[];
  onResult?: (questionId: string, result: PaperResult & { answerText: string }) => void;
}) {
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
        const useFastAnswer =
          Boolean(text.trim()) &&
          (Boolean(question.multipleChoice) || question.answerCheckMode === "final-number");
        const dataUrl = file
          ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error("Could not read the paper."));
              reader.readAsDataURL(file);
            })
          : null;
        const result = await previewGradeAnswer({
          data: {
            assignmentId,
            questionId: question.id,
            answerText: text,
            imageDataUrls: [],
            padDataUrls: dataUrl && !useFastAnswer ? [dataUrl] : [],
            priorFlags: 0,
          },
        });
        // One test session, one mark per question: share it with question view.
        onResult?.(question.id, {
          verdict: result.verdict,
          awardedMarks: Number(result.awardedMarks ?? 0),
          feedback: result.feedback ?? "",
          answerText: text,
        });
        return result;
      }}
    />
  );
}
