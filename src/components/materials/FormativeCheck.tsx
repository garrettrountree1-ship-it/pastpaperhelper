import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PartyPopper, Send, Sparkles, Timer, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  answerFormativeCheck,
  closeFormativeCheck,
  getActiveFormativeCheck,
  launchFormativeCheck,
  listFormativeResults,
} from "@/lib/formative.functions";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";

const TIMER_OPTIONS = [
  { label: "30 sec", value: 30 },
  { label: "1 min", value: 60 },
  { label: "2 min", value: 120 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
];

function useCountdown(endsAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const left = Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return { left, label: mm > 0 ? `${mm}:${ss}` : `${left}s` };
}

/** Teacher-only launcher for a timed quick class question. */
export function FormativeCheckButton({
  classId,
  sectionId,
}: {
  classId: string;
  sectionId: string | null;
}) {
  const queryClient = useQueryClient();
  const launch = useServerFn(launchFormativeCheck);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [seconds, setSeconds] = useState(60);

  const send = useMutation({
    mutationFn: () =>
      launch({
        data: {
          classId,
          sectionId,
          question: question.trim(),
          expectedAnswer: expected.trim() || null,
          seconds,
        },
      }),
    onSuccess: async () => {
      toast.success("Sent to the class");
      setOpen(false);
      setQuestion("");
      setExpected("");
      await queryClient.invalidateQueries({ queryKey: ["formative-active", classId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="Send a quick question to the class">
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">Formative check</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a formative check</DialogTitle>
          <DialogDescription>
            Students answer live and see straight away whether they&apos;ve got it, until the timer
            runs out.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="formative-question">Question</Label>
            <Textarea
              id="formative-question"
              rows={3}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="e.g. Why does the rate of reaction increase when the temperature rises?"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="formative-answer">Answer (optional)</Label>
            <Textarea
              id="formative-answer"
              rows={2}
              value={expected}
              onChange={(event) => setExpected(event.target.value)}
              placeholder="Leave blank and the AI works out the correct answer itself"
            />
          </div>
          <div className="space-y-1">
            <Label>Timer</Label>
            <div className="flex flex-wrap gap-2">
              {TIMER_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={seconds === option.value ? "default" : "outline"}
                  onClick={() => setSeconds(option.value)}
                >
                  <Timer className="size-3" />
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => send.mutate()}
            disabled={question.trim().length < 3 || send.isPending}
          >
            <Send className="size-4" />
            {send.isPending ? "Sending..." : "Send to students"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Live panel shown to everyone in the lesson while a check is running: the
 * teacher watches results come in, students answer and get marked instantly.
 */
export function FormativeCheckPanel({
  classId,
  asStudent = false,
}: {
  classId: string;
  /** Demo accounts viewing the class as a student answer like a student. */
  asStudent?: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchActive = useServerFn(getActiveFormativeCheck);
  const fetchResults = useServerFn(listFormativeResults);
  const submit = useServerFn(answerFormativeCheck);
  const close = useServerFn(closeFormativeCheck);

  const active = useQuery({
    queryKey: ["formative-active", classId],
    queryFn: () => fetchActive({ data: { classId } }),
    refetchInterval: 5000,
  });
  const raw = active.data ?? null;
  const check = raw ? { ...raw, isTeacher: raw.isTeacher && !asStudent } : null;
  const countdown = useCountdown(check?.endsAt);
  const [answer, setAnswer] = useState("");
  const [dismissed, setDismissed] = useState<string | null>(null);

  const results = useQuery({
    queryKey: ["formative-results", check?.id],
    queryFn: () => fetchResults({ data: { checkId: check!.id } }),
    enabled: Boolean(check?.isTeacher && check?.id),
    refetchInterval: 4000,
  });

  const send = useMutation({
    mutationFn: () => submit({ data: { checkId: check!.id, answer: answer.trim() } }),
    onSuccess: async () => {
      setAnswer("");
      await queryClient.invalidateQueries({ queryKey: ["formative-active", classId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const latest = useMemo(
    () => (check?.myAttempts.length ? check.myAttempts[check.myAttempts.length - 1] : null),
    [check],
  );

  useEffect(() => {
    if (check?.id) setAnswer("");
  }, [check?.id]);

  if (!check || countdown?.left === 0 || dismissed === check.id) return null;
  const correct = latest?.verdict === "correct";

  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-[70] w-[min(92vw,26rem)] rounded-xl border border-border bg-background p-4 shadow-xl">
      <div className="flex items-start gap-2">
        <Badge variant="secondary" className="shrink-0">
          <Timer className="mr-1 size-3" />
          {countdown?.label ?? "--"}
        </Badge>
        <p className="min-w-0 flex-1 text-sm font-medium">{check.question}</p>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label="Hide class question"
          onClick={async () => {
            if (check.isTeacher) {
              await close({ data: { checkId: check.id } });
              await queryClient.invalidateQueries({ queryKey: ["formative-active", classId] });
            }
            setDismissed(check.id);
          }}
        >
          <X className="size-4" />
        </Button>
      </div>

      {check.isTeacher ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            {(results.data ?? []).length} answered
            {" · "}
            {(results.data ?? []).filter((r) => r.verdict === "correct").length} correct
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {(results.data ?? []).map((row) => (
              <div
                key={row.studentId}
                className="flex items-center justify-between gap-2 rounded-md bg-secondary/50 px-2 py-1 text-xs"
              >
                <span className="truncate">{row.name}</span>
                <span
                  className={
                    row.verdict === "correct" ? "text-primary" : "text-muted-foreground"
                  }
                >
                  {row.verdict === "correct" ? "Correct" : "Still working"} · {row.attempts}{" "}
                  {row.attempts === 1 ? "try" : "tries"}
                </span>
              </div>
            ))}
            {(results.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Waiting for answers…</p>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Closing this panel ends the question for the class.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {correct ? (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-3">
              <p className="flex items-center gap-2 font-display text-base text-primary">
                <PartyPopper className="size-5" />
                Yes! That&apos;s exactly right — brilliant work!
              </p>
              {latest?.feedback ? <p className="mt-1 text-sm">{latest.feedback}</p> : null}
            </div>
          ) : latest ? (
            <div className="rounded-lg border border-accent bg-accent/30 p-3 text-sm">
              <p className="font-medium">You&apos;re on your way — keep going!</p>
              <p className="mt-1">{latest.feedback}</p>
            </div>
          ) : null}

          {!correct ? (
            <>
              <Textarea
                rows={3}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Type your answer in English"
              />
              {answer && !isEnglishOnly(answer) ? (
                <p className="text-xs text-destructive">{ENGLISH_ONLY_MESSAGE}</p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {check.myAttempts.length > 0
                    ? `Attempt ${check.myAttempts.length} sent — try again!`
                    : "As many tries as you like before the timer ends"}
                </span>
                <Button
                  size="sm"
                  onClick={() => send.mutate()}
                  disabled={!answer.trim() || send.isPending || !isEnglishOnly(answer)}
                >
                  {send.isPending ? "Checking..." : "Send answer"}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
