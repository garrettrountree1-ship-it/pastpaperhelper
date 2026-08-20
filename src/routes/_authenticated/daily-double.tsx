import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { formatClock } from "@/components/quizzes/QuizzesSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { startDailyDouble, submitDailyDouble } from "@/lib/games.functions";

export const Route = createFileRoute("/_authenticated/daily-double")({
  head: () => ({
    meta: [
      { title: "Daily double · PastPaperHelper.AI" },
      { name: "description", content: "One bonus past-paper question a day, worth two tokens." },
      { property: "og:title", content: "Daily double · PastPaperHelper.AI" },
      {
        property: "og:description",
        content: "One bonus past-paper question a day, worth two tokens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DailyDoublePage,
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

function DailyDoublePage() {
  const queryClient = useQueryClient();
  const start = useServerFn(startDailyDouble);
  const send = useServerFn(submitDailyDouble);

  const round = useQuery({ queryKey: ["daily-double"], queryFn: () => start({}) });

  const [answer, setAnswer] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  useEffect(() => {
    if (!round.data) return;
    setSeconds(round.data.secondsLeft);
    if (round.data.markScheme) setRevealed(round.data.markScheme);
  }, [round.data]);

  const over = Boolean(round.data?.done) || (round.data ? seconds <= 0 : false);

  useEffect(() => {
    if (over || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [over, seconds > 0]);

  // When the clock runs out, refetch so the mark scheme comes back from the server.
  useEffect(() => {
    if (!round.data || round.data.done || seconds > 0 || revealed) return;
    queryClient.invalidateQueries({ queryKey: ["daily-double"] });
  }, [seconds, round.data, revealed, queryClient]);

  const mutation = useMutation({
    mutationFn: () => send({ data: { answerText: answer } }),
    onSuccess: (result) => {
      setFeedback(result.feedback);
      if (result.markScheme) setRevealed(result.markScheme);
      if (result.correct) {
        toast.success(`Daily double won — ${result.awarded} token(s)`);
        queryClient.invalidateQueries({ queryKey: ["daily-double"] });
        queryClient.invalidateQueries({ queryKey: ["games-overview"] });
      } else {
        toast.error("Not quite — keep trying while the clock runs.");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
      queryClient.invalidateQueries({ queryKey: ["daily-double"] });
    },
  });

  return (
    <div className="min-h-screen">
      <AppHeader role="student" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {round.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : round.isError ? (
          <div className="paper p-8 text-center">
            <p className="mb-4 text-muted-foreground">{(round.error as Error).message}</p>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to your classes</Link>
            </Button>
          </div>
        ) : round.data ? (
          <>
            <div className="paper mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <h1 className="font-display text-2xl">Daily double</h1>
                <p className="text-sm text-muted-foreground">
                  {round.data.marks} mark question · worth 2 tokens · attempt {round.data.attempts + 1}
                </p>
              </div>
              {over ? (
                <Badge variant="secondary">{round.data.correct ? "Won" : "Finished"}</Badge>
              ) : (
                <span className={`font-mono text-2xl ${seconds < 30 ? "text-destructive" : ""}`}>
                  {formatClock(seconds)}
                </span>
              )}
            </div>

            <section className="paper p-5">
              <p className="whitespace-pre-wrap text-sm">{round.data.questionText}</p>
              {round.data.imageUrls.map((url) => (
                <img key={url} src={url} alt="Question" className="mt-3 w-full rounded-md border" />
              ))}

              {over ? (
                <>
                  <p className="mt-4 text-sm text-muted-foreground">
                    {round.data.correct
                      ? "Nice work — tokens are on the leaderboard."
                      : "Today's chance is gone. A new question unlocks tomorrow."}
                  </p>
                  {revealed ? (
                    <div className="mt-4 rounded-md border bg-muted/40 p-4">
                      <h2 className="font-display text-lg">Mark scheme answer</h2>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{revealed}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="mt-4 space-y-2">
                  <Textarea
                    rows={5}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Type your full answer in English"
                  />
                  {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
                  <Button
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending || answer.trim().length === 0}
                  >
                    Submit answer
                  </Button>
                </div>
              )}
            </section>

            <Button asChild variant="outline" className="mt-4">
              <Link to="/dashboard">Back to your classes</Link>
            </Button>
          </>
        ) : null}
      </main>
    </div>
  );
}
