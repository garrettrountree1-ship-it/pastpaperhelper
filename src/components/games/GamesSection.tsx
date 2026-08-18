import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AliasAvatar } from "@/components/games/AliasAvatar";
import { GameRecordPanel } from "@/components/games/GameRecordPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { GAME_LABELS, type GameKey } from "@/lib/game-catalog";
import {
  adjustTokens,
  getGamesOverview,
  getTokenHistory,
  pairClassRandomly,
  requestMatch,
  resetLeaderboard,
} from "@/lib/games.functions";

export function GamesSection({
  classId,
  role,
}: {
  classId: string;
  role: "teacher" | "student";
}) {
  const overview = useQuery({
    queryKey: ["games-overview"],
    queryFn: useServerFn(getGamesOverview),
  });

  if (overview.isLoading) return <Skeleton className="h-64 w-full" />;
  if (overview.isError) {
    return (
      <div className="paper p-8 text-center text-muted-foreground">
        {(overview.error as Error).message}
      </div>
    );
  }

  if (role === "teacher") {
    return (
      <TeacherGames
        classId={classId}
        classes={(overview.data?.teacherClasses ?? []).filter((c) => c.id === classId)}
      />
    );
  }

  const data = overview.data!;
  return (
    <StudentGames
      disabled={(data.disabledGames?.[classId] ?? []) as GameKey[]}
      data={{
        ...data,
        studentClasses: data.studentClasses.filter((c) => c.id === classId),
        matches: data.matches.filter((m) => m.classId === classId),
      }}
    />
  );
}


/* ------------------------------------------------------------- teacher ---- */

type TeacherClass = {
  id: string;
  name: string;
  subject: string;
  leaderboard: { studentId: string; alias: string; tokens: number; demo: boolean }[];
};

function TeacherGames({ classId, classes }: { classId: string; classes: TeacherClass[] }) {
  const queryClient = useQueryClient();
  const pair = useServerFn(pairClassRandomly);
  const reset = useServerFn(resetLeaderboard);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["games-overview"] });

  const pairMutation = useMutation({
    mutationFn: (input: { classId: string; mode: "random" | "similar" }) => pair({ data: input }),
    onSuccess: (result) => {
      toast.success(`${result.created} challenge(s) created`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resetMutation = useMutation({
    mutationFn: (classId: string) => reset({ data: { classId } }),
    onSuccess: () => {
      toast.success("Leaderboard reset to zero");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (classes.length === 0) {
    return (
      <div className="paper p-8 text-center text-muted-foreground">
        Create a class and publish some homework first — game questions come from past questions.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="paper p-5">
        <h2 className="text-3xl">Challenges &amp; leaderboard</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Students play under a permanent animal alias. Head-to-head wins pay 1 token, the daily
          double pays 2, and nobody can earn more than 3 tokens a day.
        </p>
      </div>

      {classes.map((klass) => (
        <section key={klass.id} className="paper p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <h3 className="font-display text-2xl">{klass.name}</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => pairMutation.mutate({ classId: klass.id, mode: "random" })}
                disabled={pairMutation.isPending}
              >
                Pair randomly
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => pairMutation.mutate({ classId: klass.id, mode: "similar" })}
                disabled={pairMutation.isPending}
              >
                Pair by ability
              </Button>
              <TokenHistoryDialog classId={klass.id} />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm("Reset every token in this class to zero?")) {
                    resetMutation.mutate(klass.id);
                  }
                }}
              >
                Reset leaderboard
              </Button>
            </div>
          </div>

          <div className="divide-y">
            {klass.leaderboard.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">No students in this class yet.</p>
            ) : (
              klass.leaderboard.map((entry, index) => (
                <div key={entry.studentId} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{index + 1}.</span>
                    <AliasAvatar alias={entry.alias} />
                    {entry.alias}
                    {entry.demo ? (
                      <Badge variant="outline" className="text-xs">
                        demo
                      </Badge>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{entry.tokens} tokens</Badge>
                    <AdjustTokensDialog
                      classId={klass.id}
                      studentId={entry.studentId}
                      alias={entry.alias}
                      onDone={refresh}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function AdjustTokensDialog({
  classId,
  studentId,
  alias,
  onDone,
}: {
  classId: string;
  studentId: string;
  alias: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState("");
  const adjust = useServerFn(adjustTokens);

  const mutation = useMutation({
    mutationFn: () => adjust({ data: { classId, studentId, delta, reason } }),
    onSuccess: () => {
      toast.success("Tokens updated — the student has been messaged");
      setOpen(false);
      setReason("");
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Tokens
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust tokens for {alias}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token-delta">Change (use a negative number to deduct)</Label>
            <Input
              id="token-delta"
              type="number"
              value={delta}
              onChange={(event) => setDelta(Number(event.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token-reason">Message to the student (required)</Label>
            <Input
              id="token-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Great effort explaining rates of reaction today"
            />
          </div>
        </div>
        <DialogFooter>
          <p className="text-xs text-muted-foreground">
            This note is sent to the student as a message from you, so they know why their tokens
            changed.
          </p>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || delta === 0 || !reason.trim()}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenHistoryDialog({ classId }: { classId: string }) {
  const [open, setOpen] = useState(false);
  const load = useServerFn(getTokenHistory);
  const history = useQuery({
    queryKey: ["token-history", classId],
    queryFn: () => load({ data: { classId } }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Token history
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Token history</DialogTitle>
        </DialogHeader>
        {history.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (history.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No token activity yet.</p>
        ) : (
          <div className="divide-y">
            {(history.data ?? []).map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {row.alias} · <span className="text-muted-foreground">{row.reason}</span>
                </span>
                <span className={row.delta > 0 ? "text-primary" : "text-destructive"}>
                  {row.delta > 0 ? `+${row.delta}` : row.delta}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------- student ---- */

type StudentData = Awaited<ReturnType<typeof getGamesOverview>>;

function StudentGames({ data, disabled }: { data: StudentData; disabled: GameKey[] }) {
  const show = (key: GameKey) => !disabled.includes(key);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const request = useServerFn(requestMatch);

  const mutation = useMutation({
    mutationFn: (classId: string) => request({ data: { classId } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["games-overview"] });
      navigate({ to: "/challenge/$matchId", params: { matchId: result.matchId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openMatches = data.matches.filter((m) => !m.resolved);
  const pastMatches = data.matches.filter((m) => m.resolved);

  return (
    <div className="space-y-6">
      <div className="paper p-5">
        <h2 className="text-3xl">Games</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          You play as your secret animal name. Beat a classmate to a past-paper question for 1
          token, catch the daily double for 2. Maximum {data.dailyCap} tokens a day — you have{" "}
          {data.tokensToday} today.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="paper p-5">
          <h3 className="font-display text-xl">Daily double</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            One bonus question a day, worth 2 tokens. The timer is one minute per mark.
          </p>
          {data.dailyDouble.done ? (
            <p className="mt-3 text-sm">
              {data.dailyDouble.correct
                ? `Won ${data.dailyDouble.awarded} token(s) today. Come back tomorrow.`
                : "Today's chance is gone — come back tomorrow."}
            </p>
          ) : (
            <Button asChild className="mt-3">
              <Link to="/daily-double">Play the daily double</Link>
            </Button>
          )}
        </div>

        <div className="paper p-5">
          <h3 className="font-display text-xl">Head-to-head</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            We match you with a classmate of similar homework average. Fastest fully correct answer
            takes the token.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.studentClasses.map((klass) => (
              <Button
                key={klass.id}
                variant="outline"
                onClick={() => mutation.mutate(klass.id)}
                disabled={mutation.isPending}
              >
                Challenge in {klass.name}
              </Button>
            ))}
          </div>
        </div>

        <div className="paper p-5">
          <h3 className="font-display text-xl">Vocab bingo</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            A nine-word card from your homework vocabulary. Match each meaning to the right word and
            complete any row, column or diagonal for 1 token.
          </p>
          <Button asChild className="mt-3" variant="outline">
            <Link to="/vocab-bingo">Play vocab bingo</Link>
          </Button>
        </div>

        <div className="paper p-5">
          <h3 className="font-display text-xl">Boss question</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The hardest past-paper question of the day, twelve minutes on the clock. Only full marks
            beats it — worth 3 tokens.
          </p>
          <Button asChild className="mt-3" variant="outline">
            <Link to="/boss-question">Face the boss</Link>
          </Button>
        </div>

        <div className="paper p-5">
          <h3 className="font-display text-xl">Wager round</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Stake 1 or 2 tokens before you see the question. Full marks doubles your stake, anything
            less loses it. One submission, once a day.
          </p>
          <Button asChild className="mt-3" variant="outline">
            <Link to="/wager-round">Place a wager</Link>
          </Button>
        </div>
      </div>


      {openMatches.length > 0 ? (
        <section className="paper p-5">
          <h3 className="font-display text-xl">Your open challenges</h3>
          <div className="mt-2 divide-y">
            {openMatches.map((match) => (
              <div key={match.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">
                  vs {match.opponentAlias}
                  {match.myAttemptDone ? " · you have finished" : ""}
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link to="/challenge/$matchId" params={{ matchId: match.id }}>
                    Open
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.studentClasses.map((klass) => (
        <section key={klass.id} className="paper p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <h3 className="font-display text-2xl">{klass.name} leaderboard</h3>
            <p className="text-sm text-muted-foreground">
              You are <span className="font-medium text-foreground">{klass.alias}</span> ·{" "}
              {klass.tokens} tokens
            </p>
          </div>
          <div className="divide-y">
            {klass.leaderboard.map((entry, index) => (
              <div key={entry.alias} className="flex items-center justify-between gap-3 py-2">
                <span className={`flex items-center gap-2 text-sm ${entry.isYou ? "font-medium" : ""}`}>
                  <span className="text-muted-foreground">{index + 1}.</span>
                  <AliasAvatar alias={entry.alias} />
                  {entry.alias}
                  {entry.isYou ? " (you)" : ""}
                  {entry.demo ? (
                    <Badge variant="outline" className="text-xs">
                      demo
                    </Badge>
                  ) : null}
                </span>
                <Badge variant="secondary">{entry.tokens}</Badge>
              </div>
            ))}
          </div>
        </section>
      ))}

      {pastMatches.length > 0 ? (
        <section className="paper p-5">
          <h3 className="font-display text-xl">Finished challenges</h3>
          <div className="mt-2 divide-y">
            {pastMatches.map((match) => (
              <div key={match.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>vs {match.opponentAlias}</span>
                <span className="text-muted-foreground">
                  {match.won ? "You won" : match.winnerAlias ? `${match.winnerAlias} won` : "No winner"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
