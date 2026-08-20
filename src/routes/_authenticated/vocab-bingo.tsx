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
import { getVocabBingo, markBingoCell } from "@/lib/game-modes.functions";

export const Route = createFileRoute("/_authenticated/vocab-bingo")({
  head: () => ({
    meta: [
      { title: "Vocab bingo · PastPaperHelper.AI" },
      {
        name: "description",
        content: "Match key homework vocabulary to its meaning and complete a line for tokens.",
      },
      { property: "og:title", content: "Vocab bingo · PastPaperHelper.AI" },
      {
        property: "og:description",
        content: "Match key homework vocabulary to its meaning and complete a line for tokens.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VocabBingoPage,
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

function VocabBingoPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(getVocabBingo);
  const mark = useServerFn(markBingoCell);

  const card = useQuery({ queryKey: ["vocab-bingo"], queryFn: () => load({ data: {} }) });

  const [seconds, setSeconds] = useState(0);
  const [last, setLast] = useState<{ correct: boolean; term: string } | null>(null);

  useEffect(() => {
    if (card.data) setSeconds(card.data.secondsLeft);
  }, [card.data]);

  const over = Boolean(card.data?.done) || (card.data ? seconds <= 0 : false);

  useEffect(() => {
    if (over || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [over, seconds > 0]);

  const mutation = useMutation({
    mutationFn: (cellIndex: number) => mark({ data: { cellIndex } }),
    onSuccess: (result) => {
      setLast({ correct: result.correct, term: result.correctTerm });
      if (result.awardedNow > 0) toast.success(`Bingo line — +${result.awardedNow} token(s)`);
      else if (result.cappedOut)
        toast.info(
          `Line complete! You've already hit today's ${result.dailyCap}-token cap, so no extra tokens — lines still count.`,
        );
      queryClient.invalidateQueries({ queryKey: ["vocab-bingo"] });
      queryClient.invalidateQueries({ queryKey: ["games-overview"] });
    },

    onError: (error: Error) => {
      toast.error(error.message);
      queryClient.invalidateQueries({ queryKey: ["vocab-bingo"] });
    },
  });

  return (
    <div className="min-h-screen">
      <AppHeader role="student" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {card.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : card.isError ? (
          <div className="paper p-8 text-center">
            <p className="mb-4 text-muted-foreground">{(card.error as Error).message}</p>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to your classes</Link>
            </Button>
          </div>
        ) : card.data ? (
          <>
            <div className="paper mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <h1 className="font-display text-2xl">Vocab bingo</h1>
                <p className="text-sm text-muted-foreground">
                  {card.data.className} · clue {card.data.clueNumber} of {card.data.totalClues} ·{" "}
                  {card.data.lines} line{card.data.lines === 1 ? "" : "s"} · {card.data.awarded}{" "}
                  token(s)
                </p>
              </div>
              {over ? (
                <Badge variant="secondary">Finished</Badge>
              ) : (
                <span className={`font-mono text-2xl ${seconds < 60 ? "text-destructive" : ""}`}>
                  {formatClock(seconds)}
                </span>
              )}
            </div>

            {over ? (
              <section className="paper p-5">
                <p className="text-sm text-muted-foreground">
                  Today's card is done — you completed {card.data.lines} line
                  {card.data.lines === 1 ? "" : "s"} and earned {card.data.awarded} token(s). A new
                  card appears tomorrow.
                </p>
              </section>
            ) : (
              <section className="paper p-5">
                <div className="rounded-md border bg-muted/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Which word means
                  </p>
                  <p className="mt-1 text-lg font-medium">{card.data.clue?.translation}</p>
                  {card.data.clue?.hint ? (
                    <p className="mt-1 text-sm text-muted-foreground">{card.data.clue.hint}</p>
                  ) : null}
                </div>

                {last ? (
                  <p className="mt-3 text-sm">
                    {last.correct ? (
                      <span className="text-primary">Correct — {last.term} marked off.</span>
                    ) : (
                      <span className="text-destructive">
                        Not that one — the answer was {last.term}.
                      </span>
                    )}
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {card.data.cells.map((cell, index) => {
                    const marked = card.data!.marked.includes(index);
                    return (
                      <button
                        key={cell.term}
                        type="button"
                        onClick={() => mutation.mutate(index)}
                        disabled={marked || mutation.isPending}
                        className={`min-h-20 rounded-md border p-2 text-sm transition ${
                          marked
                            ? "border-primary bg-primary/10 font-medium text-primary"
                            : "hover:border-primary hover:bg-muted"
                        }`}
                      >
                        {cell.term}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  Complete any row, column or diagonal for 1 token. Every clue is asked once.
                </p>
              </section>
            )}

            <Button asChild variant="outline" className="mt-4">
              <Link to="/dashboard">Back to your classes</Link>
            </Button>
          </>
        ) : null}
      </main>
    </div>
  );
}
