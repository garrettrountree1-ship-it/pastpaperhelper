import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Download,
  Eye,
  ImagePlus,
  NotebookPen,
  PartyPopper,
  Send,
  Sparkles,
  Timer,
  TimerReset,
  X,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  answerFormativeCheck,
  closeFormativeCheck,
  extendFormativeCheck,
  getActiveFormativeCheck,
  getFormativeLeaderboard,
  launchFormativeCheck,
  listFormativeHistory,
  listFormativeResults,
  listMyFormativeChecks,
  releaseFormativeAnswer,
  resetFormativePoints,
  revealFormativeAnswerForMe,
  setFormativeLeaderboard,
} from "@/lib/formative.functions";
import { ENGLISH_ONLY_MESSAGE, isEnglishOnly } from "@/lib/language";
import { listClassRoster } from "@/lib/materials.functions";

import { downloadXlsx } from "@/lib/xlsx-export";

/**
 * Shrinks a pasted or chosen picture to a sensible width and returns it as a
 * data URL, so the question image travels with the check itself.
 */
async function fileToDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That picture could not be read."));
    reader.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That picture could not be read."));
      el.src = raw;
    });
    const maxWidth = 1400;
    const scale = Math.min(1, maxWidth / (img.naturalWidth || maxWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.naturalWidth || maxWidth) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || maxWidth) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return raw;
  }
}

const TIMER_OPTIONS = [
  { label: "30 sec", value: 30 },
  { label: "1 min", value: 60 },
  { label: "2 min", value: 120 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
];

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const mm = Math.floor(safe / 60);
  const ss = String(safe % 60).padStart(2, "0");
  return mm > 0 ? `${mm}:${ss}` : `${safe}s`;
}

function useCountdown(endsAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const left = Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000));
  return { left, label: formatDuration(left) };
}

/** Counts up for as long as the student needs, from when the question was sent. */
function useStopwatch(startedAt: string | undefined, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || !running) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [startedAt, running]);
  if (!startedAt) return null;
  const elapsed = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000));
  return { elapsed, label: formatDuration(elapsed) };
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
  const roster = useServerFn(listClassRoster);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [questionImage, setQuestionImage] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(60);
  const [customTimer, setCustomTimer] = useState(false);
  const [countUp, setCountUp] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("1");
  const [customSeconds, setCustomSeconds] = useState("30");
  const [selected, setSelected] = useState<string[]>([]);
  const wholeClass = selected.length === 0;
  const customTotal =
    Math.max(0, Math.floor(Number(customMinutes) || 0)) * 60 +
    Math.max(0, Math.floor(Number(customSeconds) || 0));
  const effectiveSeconds = countUp ? 1800 : customTimer ? customTotal : seconds;
  const timerValid = countUp || (effectiveSeconds >= 15 && effectiveSeconds <= 1800);

  const students = useQuery({
    queryKey: ["class-roster", classId],
    queryFn: () => roster({ data: { classId } }),
    enabled: open,
  });

  const send = useMutation({
    mutationFn: () =>
      launch({
        data: {
          classId,
          sectionId,
          question: question.trim(),
          expectedAnswer: expected.trim() || null,
          questionImage,
          seconds: effectiveSeconds,
          countUp,
          targetStudentIds: selected,
        },
      }),
    onSuccess: async () => {
      toast.success(
        wholeClass
          ? "Sent to the class"
          : `Sent to ${selected.length} student${selected.length === 1 ? "" : "s"}`,
      );
      setOpen(false);
      setQuestion("");
      setExpected("");
      setQuestionImage(null);
      setSelected([]);
      setCustomTimer(false);
      setCountUp(false);
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
            <Label htmlFor="formative-question">Question *</Label>
            <Textarea
              id="formative-question"
              rows={3}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onPaste={async (event) => {
                const file = Array.from(event.clipboardData.files).find((f) =>
                  f.type.startsWith("image/"),
                );
                if (!file) return;
                event.preventDefault();
                try {
                  setQuestionImage(await fileToDataUrl(file));
                  toast.success("Picture added to the question");
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
              placeholder="Add text here, or paste a picture of the question"
            />
            <p className="text-xs text-muted-foreground">
              Copy a picture of the question and paste it here (Ctrl/⌘+V) — students see the
              picture and the AI reads it too.
            </p>
            <div className="flex items-center gap-2">
              <Button asChild type="button" size="sm" variant="outline">
                <label className="cursor-pointer">
                  <ImagePlus className="size-4" />
                  Add picture
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      try {
                        setQuestionImage(await fileToDataUrl(file));
                      } catch (error) {
                        toast.error((error as Error).message);
                      }
                    }}
                  />
                </label>
              </Button>
              {questionImage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setQuestionImage(null)}
                >
                  <X className="size-4" />
                  Remove picture
                </Button>
              ) : null}
            </div>
            {questionImage ? (
              <img
                src={questionImage}
                alt="Question picture that students will see"
                className="max-h-48 w-full rounded-md border border-border object-contain"
              />
            ) : null}
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
            <Label>Send to</Label>
            <p className="text-xs text-muted-foreground">
              Pick the whole class, or tap one or more students to send it to just them.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={wholeClass ? "default" : "outline"}
                onClick={() => setSelected([])}
              >
                Whole class
              </Button>
              {(students.data ?? []).map((student) => (
                <Button
                  key={student.id}
                  type="button"
                  size="sm"
                  variant={selected.includes(student.id) ? "default" : "outline"}
                  onClick={() =>
                    setSelected((prev) =>
                      prev.includes(student.id)
                        ? prev.filter((id) => id !== student.id)
                        : [...prev, student.id],
                    )
                  }
                >
                  {student.name}
                </Button>
              ))}
              {students.isPending && open ? (
                <span className="text-xs text-muted-foreground">Loading students...</span>
              ) : null}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Timer</Label>
            <div className="flex flex-wrap gap-2">


              {TIMER_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={
                    seconds === option.value && !customTimer && !countUp ? "default" : "outline"
                  }
                  onClick={() => {
                    setCustomTimer(false);
                    setCountUp(false);
                    setSeconds(option.value);
                  }}
                >
                  <Timer className="size-3" />
                  {option.label}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant={customTimer && !countUp ? "default" : "outline"}
                onClick={() => {
                  setCountUp(false);
                  setCustomTimer(true);
                }}
              >
                <Timer className="size-3" />
                Custom
              </Button>
              <Button
                type="button"
                size="sm"
                variant={countUp ? "default" : "outline"}
                onClick={() => {
                  setCustomTimer(false);
                  setCountUp(true);
                }}
              >
                <TimerReset className="size-3" />
                Count up
              </Button>
            </div>
            {countUp ? (
              <p className="pt-1 text-xs text-muted-foreground">
                No time limit — the clock counts up while students work, and each student sees
                the total time they took once they get it right.
              </p>
            ) : null}
            {customTimer && !countUp ? (
              <div className="flex items-center gap-2 pt-1">
                <Input
                  id="formative-custom-minutes"
                  type="number"
                  min={0}
                  max={30}
                  className="w-20"
                  value={customMinutes}
                  onChange={(event) => setCustomMinutes(event.target.value)}
                  placeholder="min"
                />
                <span className="text-xs text-muted-foreground">min</span>
                <Input
                  id="formative-custom-seconds"
                  type="number"
                  min={0}
                  max={59}
                  className="w-20"
                  value={customSeconds}
                  onChange={(event) => setCustomSeconds(event.target.value)}
                  placeholder="sec"
                />
                <span className="text-xs text-muted-foreground">
                  sec · anything from 15 seconds to 30 minutes
                </span>
              </div>
            ) : null}
          </div>

        </div>
        <DialogFooter>
          <Button
            onClick={() => send.mutate()}
            disabled={
              (question.trim().length < 3 && !questionImage) || !timerValid || send.isPending
            }
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
/**
 * Finds the labels of a multi-part question — (a) (b) (c), a) b), or 1. 2. 3. —
 * so each part gets its own answer box. Returns [] for a single-part question.
 */
export function questionParts(question: string): string[] {
  const patterns = [
    /(?:^|[\s(])\(?([a-h])[).]/g,
    /(?:^|[\s(])\(?([ivx]{1,4})[).]/gi,
    /(?:^|[\s(])\(?([1-9])[).]/g,
  ];
  for (const pattern of patterns) {
    const found: string[] = [];
    for (const match of question.matchAll(pattern)) {
      const label = match[1]!.toLowerCase();
      if (!found.includes(label)) found.push(label);
    }
    if (found.length >= 2) return found.slice(0, 8);
  }
  return [];
}

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
  const addTime = useServerFn(extendFormativeCheck);
  const release = useServerFn(releaseFormativeAnswer);

  const active = useQuery({
    queryKey: ["formative-active", classId],
    queryFn: () => fetchActive({ data: { classId } }),
    refetchInterval: 5000,
  });
  const raw = active.data ?? null;
  const check = raw ? { ...raw, isTeacher: raw.isTeacher && !asStudent } : null;
  const countdown = useCountdown(check?.countUp ? undefined : check?.endsAt);
  const stopwatch = useStopwatch(check?.startedAt, Boolean(check?.countUp));
  const [answer, setAnswer] = useState("");
  const [partAnswers, setPartAnswers] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<string | null>(null);
  const parts = useMemo(() => (check ? questionParts(check.question) : []), [check?.question]);
  const combined = parts.length
    ? parts
        .map((label) => `(${label}) ${(partAnswers[label] ?? "").trim()}`)
        .filter((line) => line.replace(/^\([a-z0-9ivx]+\)\s*/i, "").length > 0)
        .join("\n")
    : answer;


  const results = useQuery({
    queryKey: ["formative-results", check?.id],
    queryFn: () => fetchResults({ data: { checkId: check!.id } }),
    enabled: Boolean(check?.isTeacher && check?.id),
    refetchInterval: 4000,
  });

  const send = useMutation({
    mutationFn: () => submit({ data: { checkId: check!.id, answer: combined.trim() } }),
    onSuccess: async () => {
      setAnswer("");
      setPartAnswers({});
      await queryClient.invalidateQueries({ queryKey: ["formative-active", classId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const extend = useMutation({
    mutationFn: (seconds: number) => addTime({ data: { checkId: check!.id, seconds } }),
    onSuccess: async () => {
      toast.success("30 seconds added");
      await queryClient.invalidateQueries({ queryKey: ["formative-active", classId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reveal = useMutation({
    mutationFn: () => release({ data: { checkId: check!.id } }),
    onSuccess: async () => {
      toast.success("Answer released to everyone");
      await queryClient.invalidateQueries({ queryKey: ["formative-active", classId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });


  const latest = useMemo(
    () => (check?.myAttempts.length ? check.myAttempts[check.myAttempts.length - 1] : null),
    [check],
  );

  useEffect(() => {
    if (check?.id) {
      setAnswer("");
      setPartAnswers({});
    }
  }, [check?.id]);

  // A student's question box only leaves the screen when they get it right (a
// short celebration first) or when the teacher closes it for everyone.
  const gotItRight = latest?.verdict === "correct";
  useEffect(() => {
    if (!check?.id || check.isTeacher || !gotItRight) return;
    // In count-up mode the total time is on screen, so leave it up a little longer.
    const id = window.setTimeout(() => setDismissed(check.id), check.countUp ? 12000 : 6000);
    return () => window.clearTimeout(id);
  }, [check?.id, check?.isTeacher, check?.countUp, gotItRight]);

  if (!check || dismissed === check.id) return null;
  const correct = gotItRight;
  const timeUp = !check.countUp && countdown?.left === 0;
  // Count-up mode: the clock runs until this student gets it right, then the
  // total time they took stays on screen.
  const totalSeconds =
    correct && latest?.createdAt && check.startedAt
      ? Math.max(
          0,
          Math.round(
            (new Date(latest.createdAt).getTime() - new Date(check.startedAt).getTime()) / 1000,
          ),
        )
      : null;


  const student = !check.isTeacher;

  return (
    // Students get a blocking screen; the teacher's card floats in the middle so
    // they can keep teaching — drawing, highlighting and scrolling — behind it.
    <div
      className={
        student
          ? "pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
          : "pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4"
      }
    >
      <div
        className={
          student
            ? "max-h-[92vh] w-[min(96vw,52rem)] overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-2xl"
            : "pointer-events-auto max-h-[80vh] w-[min(96vw,34rem)] overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-2xl"
        }
      >

        <div className="flex items-start gap-3">
          <Badge
            variant={timeUp ? "outline" : "secondary"}
            className={student ? "shrink-0 text-sm" : "shrink-0"}
          >
            <Timer className={student ? "mr-1 size-4" : "mr-1 size-3"} />
            {check.countUp
              ? totalSeconds !== null
                ? formatDuration(totalSeconds)
                : (stopwatch?.label ?? "0s")
              : timeUp
                ? "Time up"
                : (countdown?.label ?? "--")}
          </Badge>
          <p
            className={
              student
                ? "min-w-0 flex-1 whitespace-pre-wrap text-lg font-medium leading-relaxed"
                : "min-w-0 flex-1 whitespace-pre-wrap text-base font-medium leading-relaxed"
            }
          >
            {check.question}
          </p>
          {check.isTeacher ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              aria-label="End this question and close it on every screen"
              title="End this question and close it on every screen"
              onClick={async () => {
                await close({ data: { checkId: check.id } });
                await queryClient.invalidateQueries({ queryKey: ["formative-active", classId] });
                setDismissed(check.id);
              }}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>

        {check.questionImage ? (
          <img
            src={check.questionImage}
            alt="Question picture"
            className={
              student
                ? "mt-4 max-h-[45vh] w-full rounded-lg border border-border object-contain"
                : "mt-3 max-h-[38vh] w-full rounded-md border border-border object-contain"
            }
          />
        ) : null}

        {check.releasedAnswer ? (
          <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4">
            <p className="font-display text-base text-primary">The answer</p>
            <p className="mt-1 whitespace-pre-wrap text-base">{check.releasedAnswer}</p>
          </div>
        ) : null}

        {check.isTeacher ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {check.countUp ? null : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={extend.isPending}
                  onClick={() => extend.mutate(30)}
                >
                  <Timer className="size-4" />
                  Add 30 sec
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={reveal.isPending || Boolean(check.releasedAnswer)}
                onClick={() => reveal.mutate()}
              >
                <Eye className="size-4" />
                {check.releasedAnswer
                  ? "Answer released"
                  : reveal.isPending
                    ? "Working it out…"
                    : "Release the answer"}
              </Button>
            </div>
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
              This stays on every screen — including after the timer — until you press the X.
            </p>
          </div>
        ) : (

          <div className="mt-4 space-y-3">
            {correct ? (
              <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
                <p className="flex items-center gap-2 font-display text-lg text-primary">
                  <PartyPopper className="size-5" />
                  Yes! That&apos;s exactly right — brilliant work!
                </p>
                {check.countUp && totalSeconds !== null ? (
                  <p className="mt-1 flex items-center gap-2 text-base font-medium">
                    <TimerReset className="size-4" />
                    You took {formatDuration(totalSeconds)} in total.
                  </p>
                ) : null}
                {latest?.feedback ? <p className="mt-1 text-base">{latest.feedback}</p> : null}
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" onClick={() => setDismissed(check.id)}>
                    Close
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    This closes on its own in a moment.
                  </span>
                </div>
              </div>
            ) : latest ? (
              <div className="rounded-lg border border-accent bg-accent/30 p-4 text-base">
                <p className="font-medium">You&apos;re on your way — keep going!</p>
                <p className="mt-1">{latest.feedback}</p>
              </div>
            ) : null}

            {timeUp && !correct ? (
              <p className="rounded-lg border border-border bg-secondary/40 p-3 text-base">
                Time is up — you can still keep trying until you get it right.
              </p>
            ) : null}

            {!correct ? (

              <>

                {parts.length ? (
                  <div className="space-y-3">
                    {parts.map((label) => (
                      <div key={label} className="space-y-1">
                        <Label htmlFor={`part-${label}`} className="text-base">
                          Part ({label})
                        </Label>
                        <Textarea
                          id={`part-${label}`}
                          rows={2}
                          className="text-base"
                          value={partAnswers[label] ?? ""}
                          onChange={(event) =>
                            setPartAnswers((prev) => ({ ...prev, [label]: event.target.value }))
                          }
                          placeholder={`Your answer to (${label}), in English`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <Textarea
                    rows={4}
                    className="text-base"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Type your answer in English"
                  />
                )}
                {combined && !isEnglishOnly(combined) ? (
                  <p className="text-sm text-destructive">{ENGLISH_ONLY_MESSAGE}</p>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    {check.myAttempts.length > 0
                      ? `Attempt ${check.myAttempts.length} sent — try again!`
                      : "As many tries as you like"}

                  </span>
                  <Button
                    onClick={() => send.mutate()}
                    disabled={!combined.trim() || send.isPending || !isEnglishOnly(combined)}
                  >
                    {send.isPending ? "Checking..." : "Send answer"}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

}

/**
 * Teacher record book: every formative check sent in this class, the lesson it
 * belonged to, and how each student answered.
 */
export function FormativeRecordBook({ classId }: { classId: string }) {
  const fetchHistory = useServerFn(listFormativeHistory);
  const [open, setOpen] = useState(false);

  const history = useQuery({
    queryKey: ["formative-history", classId],
    queryFn: () => fetchHistory({ data: { classId } }),
    enabled: open,
  });

  const checks = history.data ?? [];
  // Students down the side, each formative check across the top — the same
  // shape as the gradebook so teachers read it the same way.
  const students = (() => {
    const map = new Map<string, string>();
    for (const check of checks) for (const s of check.students) map.set(s.studentId, s.name);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  })();

  function cellFor(checkId: string, studentId: string) {
    const check = checks.find((c) => c.id === checkId);
    return check?.students.find((s) => s.studentId === studentId);
  }

  function cellLabel(entry: ReturnType<typeof cellFor>) {
    if (!entry || !entry.answered) return "—";
    const tries = `${entry.attempts} ${entry.attempts === 1 ? "try" : "tries"}`;
    return `${entry.verdict === "correct" ? "Correct" : "Incorrect"} · ${tries}`;
  }

  function download() {
    // Oldest check first, one column per check: date + question in the header.
    const ordered = [...checks].reverse();
    const header = [
      "Student",
      ...ordered.map(
        (c) => `${new Date(c.sentAt).toLocaleDateString()} — ${c.question}`,
      ),
      "% attempted",
      "% correct",
    ];
    const rows: (string | number | null)[][] = [header];
    for (const student of students) {
      let attempted = 0;
      let correct = 0;
      const cells = ordered.map((check) => {
        const entry = cellFor(check.id, student.id);
        if (!entry || !entry.answered) return "No attempt";
        attempted += 1;
        if (entry.verdict === "correct") {
          correct += 1;
          return "Correct";
        }
        return "Incorrect";
      });
      const total = ordered.length;
      rows.push([
        student.name,
        ...cells,
        total > 0 ? `${Math.round((attempted / total) * 100)}%` : "0%",
        total > 0 ? `${Math.round((correct / total) * 100)}%` : "0%",
      ]);
    }
    downloadXlsx("formative-record-book.xlsx", "Formative checks", rows);
  }


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <NotebookPen className="size-4" />
          Formative record book
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Formative record book</DialogTitle>
          <DialogDescription>
            Every quick class question you sent, and how each student answered.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={download} disabled={checks.length === 0}>
            <Download className="size-4" />
            Download .xlsx
          </Button>
          <span className="text-xs text-muted-foreground">
            {checks.length} check{checks.length === 1 ? "" : "s"} · {students.length} student
            {students.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="max-h-[65vh] overflow-auto rounded-lg border">
          {history.isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Loading…</p>
          ) : checks.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No formative checks sent in this class yet.
            </p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-card">
                <tr>
                  <th className="sticky left-0 z-10 min-w-40 border-b border-r bg-card p-2 text-left font-medium">
                    Student
                  </th>
                  {checks.map((check) => (
                    <th
                      key={check.id}
                      className="min-w-44 border-b border-r p-2 text-left align-top font-medium"
                      title={check.expectedAnswer ?? undefined}
                    >
                      <span className="line-clamp-2">{check.question}</span>
                      <span className="mt-0.5 block font-normal text-muted-foreground">
                        {check.lesson} · {new Date(check.sentAt).toLocaleDateString()}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className="odd:bg-secondary/20">
                    <td className="sticky left-0 z-10 border-b border-r bg-card p-2 font-medium">
                      {student.name}
                    </td>
                    {checks.map((check) => {
                      const entry = cellFor(check.id, student.id);
                      return (
                        <td
                          key={check.id}
                          className={`border-b border-r p-2 align-top ${
                            !entry?.answered
                              ? "text-muted-foreground"
                              : entry.verdict === "correct"
                                ? "text-primary"
                                : "text-destructive"
                          }`}
                        >
                          {cellLabel(entry)}
                          {entry?.answered ? (
                            <span className="mt-0.5 block text-muted-foreground">
                              “{entry.answer}”
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-secondary/40 font-medium">
                  <td className="sticky left-0 z-10 border-r bg-secondary/40 p-2">Class correct</td>
                  {checks.map((check) => (
                    <td key={check.id} className="border-r p-2">
                      {check.correctCount}/{check.answeredCount || 0} answered
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


/**
 * Student review book: every quick class question they were asked, their own
 * answers, and the correct answer once it is available.
 */
export function FormativeReviewButton({ classId }: { classId: string }) {
  const fetchMine = useServerFn(listMyFormativeChecks);
  const [open, setOpen] = useState(false);
  const checks = useQuery({
    queryKey: ["formative-mine", classId],
    queryFn: () => fetchMine({ data: { classId } }),
    enabled: open,
  });
  const rows = checks.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <NotebookPen className="size-4" />
          Review class questions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Class questions</DialogTitle>
          <DialogDescription>
            Every quick question from this class, what you answered, and the answer.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto">
          {checks.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No class questions yet — they will appear here after your teacher sends one.
            </p>
          ) : (
            rows.map((row) => <ReviewRow key={row.id} row={row} />)

          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ReviewCheck = {
  id: string;
  question: string;
  questionImage: string | null;
  sentAt: string;
  lesson: string;
  answer: string | null;
  stillLive: boolean;
  myAttempts: { answer: string; verdict: string; feedback: string }[];
};

/**
 * One past class question in the student's log: their tries, a fresh practice
 * go (marked but never recorded), and the answer on request.
 */
function ReviewRow({ row }: { row: ReviewCheck }) {
  const practise = useServerFn(answerFormativeCheck);
  const showAnswer = useServerFn(revealFormativeAnswerForMe);
  const [retrying, setRetrying] = useState(false);
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const tryAgain = useMutation({
    mutationFn: () =>
      practise({ data: { checkId: row.id, answer: draft.trim(), practice: true } }),
    onError: (error: Error) => toast.error(error.message),
  });

  const reveal = useMutation({
    mutationFn: () => showAnswer({ data: { checkId: row.id } }),
    onSuccess: (result) => setRevealed(result.answer),
    onError: (error: Error) => toast.error(error.message),
  });

  const answer = revealed ?? row.answer;

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground">
        {new Date(row.sentAt).toLocaleString()}
        {row.lesson ? ` · ${row.lesson}` : ""}
      </p>
      <p className="mt-1 whitespace-pre-wrap font-medium">{row.question}</p>
      {row.questionImage ? (
        <img
          src={row.questionImage}
          alt="Question picture"
          className="mt-2 max-h-64 w-full rounded-md border border-border object-contain"
        />
      ) : null}

      {row.myAttempts.length > 0 ? (
        <div className="mt-3 space-y-1">
          {row.myAttempts.map((attempt, index) => (
            <p key={index} className="text-sm">
              <span className="text-muted-foreground">Your try {index + 1}: </span>
              <span
                className={attempt.verdict === "correct" ? "text-primary" : "text-destructive"}
              >
                {attempt.answer}
              </span>
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">You did not answer this one.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setRetrying((value) => !value);
            tryAgain.reset();
          }}
        >
          <Sparkles className="size-4" />
          {retrying ? "Hide practice" : "Try it again"}
        </Button>
        {answer ? null : (
          <Button
            size="sm"
            variant="outline"
            disabled={reveal.isPending || row.stillLive}
            onClick={() => reveal.mutate()}
          >
            <Eye className="size-4" />
            {reveal.isPending ? "Working it out…" : "View answer"}
          </Button>
        )}
      </div>

      {retrying ? (
        <div className="mt-3 space-y-2 rounded-md border border-border bg-secondary/30 p-3">
          <p className="text-xs text-muted-foreground">
            A practice go — marked for you, and not added to your teacher&apos;s record.
          </p>
          <Textarea
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type your answer in English"
          />
          {draft && !isEnglishOnly(draft) ? (
            <p className="text-sm text-destructive">{ENGLISH_ONLY_MESSAGE}</p>
          ) : null}
          <Button
            size="sm"
            onClick={() => tryAgain.mutate()}
            disabled={!draft.trim() || tryAgain.isPending || !isEnglishOnly(draft)}
          >
            <Send className="size-4" />
            {tryAgain.isPending ? "Checking…" : "Check my answer"}
          </Button>
          {tryAgain.data ? (
            <div
              className={
                tryAgain.data.verdict === "correct"
                  ? "rounded-md border border-primary/40 bg-primary/10 p-3 text-sm"
                  : "rounded-md border border-accent bg-accent/30 p-3 text-sm"
              }
            >
              <p className="font-medium">
                {tryAgain.data.verdict === "correct"
                  ? "Spot on — brilliant work!"
                  : "Good thinking — keep going!"}
              </p>
              <p className="mt-1">{tryAgain.data.feedback}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {answer ? (
        <div className="mt-3 rounded-md border border-primary/40 bg-primary/10 p-3">
          <p className="text-sm font-medium text-primary">The answer</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{answer}</p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {row.stillLive
            ? "Still open — the answer appears when your teacher shares it."
            : "Press “View answer” to see it."}
        </p>
      )}
    </div>
  );
}

