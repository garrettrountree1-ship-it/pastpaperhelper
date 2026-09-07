import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lightbulb, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { askQuestionHelp, listQuestionHelp } from "@/lib/question-help.functions";
import { TutorText } from "@/lib/tutor-text";

type Mode = "hint" | "steps";
type Turn = { role: string; content: string };

/** Small staircase glyph (lucide has no stairs icon). */
export function StairsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 20h4v-4h4v-4h4V8h4V4" />
      <path d="M3 20h18" />
    </svg>
  );
}

/** Small teacher glyph for the "Ask the teacher" button. */
export function TeacherIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21v-2a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2" />
      <path d="M12 14l-1.5 3h3L12 14z" />
    </svg>
  );
}

const COPY: Record<Mode, { title: string; description: string; placeholder: string }> = {
  hint: {
    title: "Give me a hint",
    description:
      "One nudge at a time — never the answer. Ask the tutor anything else you're unsure about.",
    placeholder: "Ask the tutor about this question…",
  },
  steps: {
    title: "Break it down step-by-step",
    description:
      "Work through the question one step at a time. Type your working for each step, then close this window and write your full answer.",
    placeholder: "Type your working for this step…",
  },
};

/**
 * On-demand AI help a student can open before or after answering. Everything
 * typed here is recorded for the teacher's detailed report.
 */
export function QuestionHelpDialog({
  questionId,
  mode,
  open,
  onOpenChange,
  answerDraft,
}: {
  questionId: string;
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  answerDraft: string;
}) {
  const ask = useServerFn(askQuestionHelp);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const opened = useRef(false);

  const existing = useQuery({
    queryKey: ["question-help", questionId],
    queryFn: () => listQuestionHelp({ data: { questionId } }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      opened.current = false;
      return;
    }
    if (existing.data) setTurns(existing.data[mode] as Turn[]);
  }, [open, mode, existing.data]);

  const send = useMutation({
    mutationFn: async (message: string | null) => {
      const { reply } = await ask({
        data: { questionId, mode, message, answerDraft: answerDraft.slice(0, 6000) },
      });
      return reply;
    },
    onSuccess: (reply) => setTurns((prev) => [...prev, { role: "tutor", content: reply }]),
    onError: (error: Error) => toast.error(error.message),
  });

  // Opening the window with nothing said yet starts the help immediately.
  useEffect(() => {
    if (!open || opened.current || !existing.data) return;
    opened.current = true;
    if ((existing.data[mode] as Turn[]).length === 0) send.mutate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, existing.data]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, send.isPending]);

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed || send.isPending) return;
    setTurns((prev) => [...prev, { role: "student", content: trimmed }]);
    setDraft("");
    send.mutate(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "hint" ? (
              <Lightbulb className="size-4 text-accent" />
            ) : (
              <StairsIcon className="size-4 text-accent" />
            )}
            {COPY[mode].title}
          </DialogTitle>
          <DialogDescription>{COPY[mode].description}</DialogDescription>
        </DialogHeader>

        <div ref={scrollRef} className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {turns.map((turn, index) => (
            <div
              key={index}
              className={
                turn.role === "student"
                  ? "ml-6 rounded-md bg-secondary px-3 py-2 text-sm"
                  : "rounded-md border px-3 py-2 text-sm"
              }
            >
              {turn.role === "student" ? (
                <p className="whitespace-pre-wrap">{turn.content}</p>
              ) : (
                <TutorText className="space-y-1" text={turn.content} />
              )}
            </div>
          ))}
          {send.isPending ? (
            <p className="text-xs text-muted-foreground">
              {mode === "hint" ? "Thinking of a hint…" : "Working out the next step…"}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={COPY[mode].placeholder}
            className="min-h-[72px] text-sm"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Back to my answer
            </Button>
            <Button onClick={submit} disabled={!draft.trim() || send.isPending}>
              <Send className="size-4" />
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The two help buttons shown beside a question. */
export function QuestionHelpButtons({
  questionId,
  answerDraft,
}: {
  questionId: string;
  answerDraft: string;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMode("hint")}
          className="gap-1.5 px-2"
          title="Give me a hint"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-warning/10 text-warning">
            <Lightbulb className="size-3.5" />
          </span>
          <span className="hidden sm:inline">Give me a hint</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMode("steps")}
          className="gap-1.5 px-2"
          title="Break it down step-by-step"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-success/10 text-success">
            <StairsIcon className="size-3.5" />
          </span>
          <span className="hidden sm:inline">Break it down step-by-step</span>
        </Button>
      </div>
      {mode ? (
        <QuestionHelpDialog
          questionId={questionId}
          mode={mode}
          open
          onOpenChange={(open) => {
            if (!open) setMode(null);
          }}
          answerDraft={answerDraft}
        />
      ) : null}
    </>
  );
}
