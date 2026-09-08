import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
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

/** Simple lightbulb for the "Give me a hint" button. */
export function HintBulbIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.5a6 6 0 0 0-3.7 10.7c.8.7 1.2 1.5 1.2 2.3v.5h5v-.5c0-.8.4-1.6 1.2-2.3A6 6 0 0 0 12 2.5z" />
      <path d="M9.8 18.5h4.4" />
      <path d="M10.4 21h3.2" />
    </svg>
  );
}

/** Staircase glyph (lucide has no stairs icon). */
export function StairsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 20h4.5v-4.5H12V11h4.5V6.5" />
      <circle cx="18.5" cy="4.8" r="2.8" />
    </svg>
  );
}

/** Teacher glyph for the "Ask the teacher" button. */
export function TeacherIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4.5" />
      <path d="M5 21v-1.5a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4V21" />
    </svg>
  );
}

const COPY: Record<Mode, { title: string; description: string; placeholder: string; close: string }> =
  {
    hint: {
      title: "Give me a hint",
      description:
        "A hint to get you started — never the answer. Ask follow-up questions below if you're still stuck.",
      placeholder: "Ask a follow-up question…",
      close: "Back to my answer",
    },
    steps: {
      title: "Break it down step-by-step",
      description:
        "The question is split into a few small steps. Answer each step here, then close this window and write your answer to get the marks.",
      placeholder: "Answer this step…",
      close: "Close and answer the question",
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
  const queryClient = useQueryClient();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [helpError, setHelpError] = useState<string | null>(null);
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
      setHelpError(null);
      const { reply } = await ask({
        data: { questionId, mode, message, answerDraft: answerDraft.slice(0, 6000) },
      });
      return reply;
    },
    onSuccess: (reply) => {
      setTurns((prev) => [...prev, { role: "tutor", content: reply }]);
      void queryClient.invalidateQueries({ queryKey: ["question-help", questionId] });
    },
    onError: (error: Error) => {
      const message = error.message || "The tutor could not respond. Please try again.";
      setHelpError(message);
      toast.error(message);
    },
  });

  // Opening the window with nothing said yet starts the help immediately.
  useEffect(() => {
    if (!open || opened.current || existing.isPending) return;
    opened.current = true;
    const savedTurns = (existing.data?.[mode] ?? []) as Turn[];
    setTurns(savedTurns);
    const lastTurn = savedTurns.at(-1);
    if (!lastTurn || lastTurn.role !== "tutor") send.mutate(null);
    // `existing.isPending` is required here: a failed/empty history request must
    // still trigger fresh help instead of leaving a blank dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, existing.data, existing.isPending]);

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
              <HintBulbIcon className="size-4 text-accent" />
            ) : (
              <StairsIcon className="size-4 text-accent" />
            )}
            {COPY[mode].title}
          </DialogTitle>
          <DialogDescription>{COPY[mode].description}</DialogDescription>
        </DialogHeader>

        {mode === "steps" ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
            Answering the steps here does not give you marks. When you finish, close this window and
            type your full answer in the answer box to get credit.
          </p>
        ) : null}

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
          {send.isPending || (turns.length === 0 && existing.isLoading) ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {mode === "hint"
                ? turns.length === 0
                  ? "Writing your hint…"
                  : "Thinking…"
                : turns.length === 0
                  ? "Splitting the question into steps…"
                  : "Working out the next step…"}
            </p>
          ) : null}
          {helpError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <p>{helpError}</p>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() => send.mutate(null)}
                disabled={send.isPending}
              >
                Try again
              </Button>
            </div>
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
              {COPY[mode].close}
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

/** Shared look for the three question help pills, so they line up neatly. */
export const HELP_PILL =
  "flex w-full items-center gap-1.5 rounded-full border px-1.5 py-1 text-left shadow-xs transition";
export const HELP_PILL_LABEL = "text-[10px] font-semibold leading-tight";
export const HELP_PILL_DOT = "grid size-6 shrink-0 place-items-center rounded-full";

/** The two help buttons shown beside a question. */
export function QuestionHelpButtons({
  questionId,
  answerDraft,
  allowHint = true,
  allowSteps = true,
}: {
  questionId: string;
  answerDraft: string;
  /** Teacher scaffolding switch for "Give me a hint". */
  allowHint?: boolean;
  /** Teacher scaffolding switch for "Break it down step-by-step". */
  allowSteps?: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  if (!allowHint && !allowSteps) return null;
  return (
    <>
      <div className="flex w-24 shrink-0 flex-col items-stretch gap-1.5 sm:w-28">
        {allowHint ? (
        <button
          type="button"
          onClick={() => setMode("hint")}
          title="Give me a hint"
          className={`${HELP_PILL} border-warning/50 bg-warning/15 hover:bg-warning/25`}
        >
          <span className={`${HELP_PILL_DOT} bg-warning text-warning-foreground`}>
            <HintBulbIcon className="size-3.5" />
          </span>
          <span className={`${HELP_PILL_LABEL} text-foreground`}>
            Give me a hint
          </span>
        </button>
        ) : null}
        {allowSteps ? (
        <button
          type="button"
          onClick={() => setMode("steps")}
          title="Break it down step-by-step"
          className={`${HELP_PILL} border-success/50 bg-success/15 hover:bg-success/25`}
        >
          <span className={`${HELP_PILL_DOT} bg-success text-success-foreground`}>
            <StairsIcon className="size-3.5" />
          </span>
          <span className={`${HELP_PILL_LABEL} text-foreground`}>
            Break it down step-by-step
          </span>
        </button>
        ) : null}
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
