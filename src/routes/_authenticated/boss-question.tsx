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
import { getBossQuestion, submitBoss } from "@/lib/game-modes.functions";

export const Route = createFileRoute("/_authenticated/boss-question")({
  head: () => ({
    meta: [
      { title: "Boss question · PastPaperHelper.AI" },
      {
        name: "description",
        content: "The hardest past-paper question of the day, worth three tokens.",
      },
      { property: "og:title", content: "Boss question · PastPaperHelper.AI" },
      {
        property: "og:description",
        content: "The hardest past-paper question of the day, worth three tokens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BossQuestionPage,
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

function BossQuestionPage() {
  const queryClient = useQueryClient();
  const start = useServerFn(getBossQuestion);
  const send = useServerFn(submitBoss);

  const round = useQuery({ queryKey: ["boss-question"], queryFn: () => start({}) });

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

  useEffect(() => {
    if (!round.data || round.data.done || seconds > 0 || revealed) return;
    queryClient.invalidateQueries({ queryKey: ["boss-question"] });
  }, [seconds, round.data, revealed, queryClient]);

  const mutation = useMutation({
    mutationFn: () => send({ data: { answerText: answer } }),
    onSuccess: (result) => {
      setFeedback(result.feedback);
      if (result.markScheme) setRevealed(result.markScheme);
      if (result.correct) {
        toast.success(`Boss cleared — ${result.awarded} token(s)`);
        queryClient.invalidateQueries({ queryKey: ["boss-question"] });
        queryClient.invalidateQueries({ queryKey: ["games-overview"] });
      } else {
        toast.error("Not full marks yet — keep working while the clock runs.");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
      queryClient.invalidateQueries({ queryKey: ["boss-question"] });
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
                <h1 className="font-display text-2xl">Boss question</h1>
                <p className="text-sm text-muted-foreground">
                  {round.data.marks} mark question · worth 3 tokens · attempt{" "}
                  {round.data.attempts + 1}
                </p>
              </div>
              {over ? (
                <Badge variant="secondary">{round.data.correct ? "Defeated" : "Finished"}</Badge>
              ) : (
                <span className={`font-mono text-2xl ${seconds < 60 ? "text-destructive" : ""}`}>
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
                      ? "Full marks — the boss is down and your tokens are on the leaderboard."
                      : "The boss survived today. A new one appears tomorrow."}
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
                  <p className="text-xs text-muted-foreground">
                    Only a full-marks answer beats the boss. Unlimited attempts until the clock runs
                    out.
                  </p>
                  <Textarea
                    rows={7}
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
