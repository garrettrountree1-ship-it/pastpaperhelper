import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AliasAvatar } from "@/components/games/AliasAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { GAME_LABELS, type GameKey } from "@/lib/game-catalog";
import { getClassGameRecord, setClassGameEnabled } from "@/lib/game-admin.functions";

function outcomeBadge(outcome: "win" | "loss" | "pending") {
  if (outcome === "win") return <Badge>Win</Badge>;
  if (outcome === "loss") return <Badge variant="outline">Loss</Badge>;
  return <Badge variant="secondary">In progress</Badge>;
}

export function GameRecordPanel({ classId }: { classId: string }) {
  const queryClient = useQueryClient();
  const fetchRecord = useServerFn(getClassGameRecord);
  const toggle = useServerFn(setClassGameEnabled);
  const [open, setOpen] = useState<string | null>(null);

  const record = useQuery({
    queryKey: ["class-game-record", classId],
    queryFn: () => fetchRecord({ data: { classId } }),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { gameKey: GameKey; enabled: boolean }) =>
      toggle({ data: { classId, ...input } }),
    onSuccess: (_result, input) => {
      toast.success(
        `${GAME_LABELS[input.gameKey]} ${input.enabled ? "switched on" : "switched off"} for this class`,
      );
      queryClient.invalidateQueries({ queryKey: ["class-game-record", classId] });
      queryClient.invalidateQueries({ queryKey: ["games-overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (record.isLoading) return <Skeleton className="h-56 w-full" />;
  if (record.isError) {
    return (
      <div className="paper p-5 text-sm text-muted-foreground">
        {(record.error as Error).message}
      </div>
    );
  }

  const data = record.data!;

  return (
    <div className="space-y-6">
      <section className="paper p-5">
        <h3 className="font-display text-2xl">Games available to students</h3>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Switch any game off and it disappears for every student in this class straight away.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.settings.map((setting) => (
            <div
              key={setting.key}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <Label htmlFor={`game-${setting.key}`} className="text-sm">
                {GAME_LABELS[setting.key]}
              </Label>
              <Switch
                id={`game-${setting.key}`}
                checked={setting.enabled}
                disabled={toggleMutation.isPending}
                onCheckedChange={(enabled) =>
                  toggleMutation.mutate({ gameKey: setting.key, enabled })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="paper p-5">
        <h3 className="font-display text-2xl">Game record</h3>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Every attempt, win and loss for each student. Click a student to see the play-by-play.
        </p>
        <div className="mt-3 divide-y">
          {data.students.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No students in this class yet.</p>
          ) : (
            data.students.map((student) => (
              <div key={student.studentId} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm">
                    <AliasAvatar alias={student.alias} />
                    <span className="font-medium">{student.name}</span>
                    <span className="text-muted-foreground">{student.alias}</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary">{student.plays} played</Badge>
                    <Badge>{student.wins} won</Badge>
                    <Badge variant="outline">{student.losses} lost</Badge>
                    {student.pending > 0 ? (
                      <Badge variant="secondary">{student.pending} open</Badge>
                    ) : null}
                    <Badge variant="outline">{student.tokens} tokens</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setOpen(open === student.studentId ? null : student.studentId)
                      }
                    >
                      {open === student.studentId ? "Hide" : "View attempts"}
                    </Button>
                  </div>
                </div>

                {open === student.studentId ? (
                  student.events.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      This student has not played a game yet.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {student.events.map((event) => (
                        <div
                          key={event.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            {outcomeBadge(event.outcome)}
                            <span className="font-medium">{GAME_LABELS[event.game]}</span>
                            <span className="text-muted-foreground">{event.detail}</span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {event.attempts > 0 ? `${event.attempts} attempt(s) · ` : ""}
                            {event.awarded > 0 ? `+${event.awarded} token(s) · ` : ""}
                            {new Date(event.at).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
