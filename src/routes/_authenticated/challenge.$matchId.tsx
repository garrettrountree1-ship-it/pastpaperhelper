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
import { getMatch, submitMatchAnswer } from "@/lib/games.functions";

export const Route = createFileRoute("/_authenticated/challenge/$matchId")({
  head: () => ({
    meta: [
      { title: "Head-to-head challenge · STEM Homework AI" },
      { name: "description", content: "Race a classmate to answer a past-paper question." },
      { property: "og:title", content: "Head-to-head challenge · STEM Homework AI" },
      { property: "og:description", content: "Race a classmate to answer a past-paper question." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChallengePage,
  notFoundComponent: () => <div className="p-8 text-center">Challenge not found.</div>,
});

function ChallengePage() {
  const { matchId } = Route.useParams();
  const queryClient = useQueryClient();
  const load = useServerFn(getMatch);
  const send = useServerFn(submitMatchAnswer);

  const match = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => load({ data: { matchId } }),
  });

  const [answer, setAnswer] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!match.data) return;
    setSeconds(match.data.attempt?.secondsLeft ?? 0);
    setAnswer(match.data.attempt?.answerText ?? "");
  }, [match.data]);

  const over =
    Boolean(match.data?.resolved) || Boolean(match.data?.attempt?.done) || (match.data ? seconds <= 0 : false);

  useEffect(() => {
    if (over || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [over, seconds > 0]);

  const mutation = useMutation({
    mutationFn: () => send({ data: { matchId, answerText: answer } }),
    onSuccess: (result) => {
      setFeedback(result.feedback);
      if (result.correct) {
        toast.success("Correct — token claimed if you were first!");
        queryClient.invalidateQueries({ queryKey: ["match", matchId] });
        queryClient.invalidateQueries({ queryKey: ["games-overview"] });
      } else {
        toast.error("Not quite — try again before the timer ends.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="min-h-screen">
      <AppHeader role="student" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {match.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : match.isError ? (
          <div className="paper p-8 text-center">
            <p className="mb-4 text-muted-foreground">{(match.error as Error).message}</p>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to your classes</Link>
            </Button>
          </div>
        ) : match.data ? (
          <>
            <div className="paper mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <h1 className="font-display text-2xl">vs {match.data.opponentAlias}</h1>
                <p className="text-sm text-muted-foreground">
                  {match.data.marks} mark question · {match.data.marks} minute
                  {match.data.marks === 1 ? "" : "s"} · unlimited attempts
                </p>
              </div>
              {match.data.resolved ? (
                <Badge variant="secondary">
                  {match.data.won
                    ? "You won 1 token"
                    : match.data.winnerAlias
                      ? `${match.data.winnerAlias} won`
                      : "No winner"}
                </Badge>
              ) : (
                <span className={`font-mono text-2xl ${seconds < 30 ? "text-destructive" : ""}`}>
                  {formatClock(seconds)}
                </span>
              )}
            </div>

            <section className="paper p-5">
              <p className="whitespace-pre-wrap text-sm">{match.data.questionText}</p>
              {match.data.imageUrls.map((url) => (
                <img key={url} src={url} alt="Question" className="mt-3 w-full rounded-md border" />
              ))}

              {over ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  This challenge is finished. Head back to games for the leaderboard.
                </p>
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
