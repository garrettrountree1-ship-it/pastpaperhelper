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
import { getWagerRound, placeWager, submitWager } from "@/lib/game-modes.functions";

export const Route = createFileRoute("/_authenticated/wager-round")({
  head: () => ({
    meta: [
      { title: "Wager round · PastPaperHelper.AI" },
      {
        name: "description",
        content: "Stake your tokens on a past-paper question before you see it.",
      },
      { property: "og:title", content: "Wager round · PastPaperHelper.AI" },
      {
        property: "og:description",
        content: "Stake your tokens on a past-paper question before you see it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WagerRoundPage,
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

function WagerRoundPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(getWagerRound);
  const round = useQuery({ queryKey: ["wager-round"], queryFn: () => load({}) });

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
        ) : round.data?.stage === "wager" ? (
          <WagerStake
            data={round.data}
            onPlaced={() => queryClient.invalidateQueries({ queryKey: ["wager-round"] })}
          />
        ) : round.data ? (
          <WagerPlay data={round.data} />
        ) : null}

        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard">Back to your classes</Link>
        </Button>
      </main>
    </div>
  );
}

type WagerData = Awaited<ReturnType<typeof getWagerRound>>;
type StakeData = Extract<WagerData, { stage: "wager" }>;
type PlayData = Extract<WagerData, { stage: "play" }>;

function WagerStake({ data, onPlaced }: { data: StakeData; onPlaced: () => void }) {
  const place = useServerFn(placeWager);
  const [classId, setClassId] = useState(data.classes[0]?.id ?? "");
  const [wager, setWager] = useState(1);

  const mutation = useMutation({
    mutationFn: () => place({ data: { classId, wager } }),
    onSuccess: onPlaced,
    onError: (error: Error) => toast.error(error.message),
  });

  const selected = data.classes.find((c) => c.id === classId);

  return (
    <section className="paper p-5">
      <h1 className="font-display text-2xl">Wager round</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Stake tokens before you see the question. A full-marks answer doubles your stake; anything
        less loses it. One wager a day.
      </p>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {data.classes.map((klass) => (
            <Button
              key={klass.id}
              size="sm"
              variant={klass.id === classId ? "default" : "outline"}
              onClick={() => setClassId(klass.id)}
            >
              {klass.name} · {klass.tokens} tokens
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: data.maxWager }, (_, index) => index + 1).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={value === wager ? "secondary" : "outline"}
              onClick={() => setWager(value)}
              disabled={(selected?.tokens ?? 0) < value}
            >
              Stake {value}
            </Button>
          ))}
        </div>

        {(selected?.tokens ?? 0) < 1 ? (
          <p className="text-sm text-muted-foreground">
            Win a challenge or the daily double first — you need at least 1 token to wager.
          </p>
        ) : null}

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !classId || (selected?.tokens ?? 0) < wager}
        >
          Lock in {wager} token{wager > 1 ? "s" : ""}
        </Button>
      </div>
    </section>
  );
}

function WagerPlay({ data }: { data: PlayData }) {
  const queryClient = useQueryClient();
  const send = useServerFn(submitWager);
  const [answer, setAnswer] = useState("");
  const [seconds, setSeconds] = useState(data.secondsLeft);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(data.markScheme);

  useEffect(() => {
    setSeconds(data.secondsLeft);
    if (data.markScheme) setRevealed(data.markScheme);
  }, [data]);

  const over = data.done || seconds <= 0;

  useEffect(() => {
    if (over) return;
    const timer = window.setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [over]);

  useEffect(() => {
    if (data.done || seconds > 0 || revealed) return;
    queryClient.invalidateQueries({ queryKey: ["wager-round"] });
  }, [seconds, data.done, revealed, queryClient]);

  const mutation = useMutation({
    mutationFn: () => send({ data: { answerText: answer } }),
    onSuccess: (result) => {
      setFeedback(result.feedback);
      if (result.markScheme) setRevealed(result.markScheme);
      if (result.correct) toast.success(`Wager won — +${result.awarded} token(s)`);
      else toast.error(`Wager lost — ${result.awarded} token(s)`);
      queryClient.invalidateQueries({ queryKey: ["wager-round"] });
      queryClient.invalidateQueries({ queryKey: ["games-overview"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      queryClient.invalidateQueries({ queryKey: ["wager-round"] });
    },
  });

  return (
    <>
      <div className="paper mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 className="font-display text-2xl">Wager round</h1>
          <p className="text-sm text-muted-foreground">
            {data.className} · {data.marks} mark question · staked {data.wager} token
            {data.wager > 1 ? "s" : ""}
          </p>
        </div>
        {over ? (
          <Badge variant={data.correct ? "secondary" : "destructive"}>
            {data.correct ? `+${data.awarded}` : `${data.awarded}`} tokens
          </Badge>
        ) : (
          <span className={`font-mono text-2xl ${seconds < 60 ? "text-destructive" : ""}`}>
            {formatClock(seconds)}
          </span>
        )}
      </div>

      <section className="paper p-5">
        <p className="whitespace-pre-wrap text-sm">{data.questionText}</p>
        {data.imageUrls.map((url) => (
          <img key={url} src={url} alt="Question" className="mt-3 w-full rounded-md border" />
        ))}

        {over ? (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              {data.correct
                ? "Full marks — your stake doubled."
                : "Not full marks, so the stake is gone. Come back tomorrow."}
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
              One submission only — make it count. Full marks doubles your stake.
            </p>
            <Textarea
              rows={6}
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
    </>
  );
}
