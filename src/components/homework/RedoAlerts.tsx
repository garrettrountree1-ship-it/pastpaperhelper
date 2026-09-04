import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listRedoAlerts } from "@/lib/app.functions";

const SEEN_KEY = "redoAlertsSeen";

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Pops up once per new rejection when a student opens the app: tells them which
 * question their teacher sent back and why, with a link straight to the redo.
 */
export function RedoAlerts({ enabled }: { enabled: boolean }) {
  const alerts = useQuery({
    queryKey: ["redo-alerts"],
    queryFn: useServerFn(listRedoAlerts),
    enabled,
    retry: 1,
  });
  const [seen, setSeen] = useState<string[] | null>(null);

  useEffect(() => {
    setSeen(readSeen());
  }, []);

  const fresh = useMemo(() => {
    if (!alerts.data || seen === null) return [];
    return alerts.data.filter((alert) => !seen.includes(`${alert.answerId}:${alert.rejectedAt}`));
  }, [alerts.data, seen]);

  const dismiss = () => {
    const keys = (alerts.data ?? []).map((alert) => `${alert.answerId}:${alert.rejectedAt}`);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(keys.slice(0, 50)));
    } catch {
      // ignore storage errors
    }
    setSeen(keys);
  };

  if (fresh.length === 0) return null;

  return (
    <Dialog open onOpenChange={(open) => (!open ? dismiss() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {fresh.length === 1
              ? "Your teacher sent a question back"
              : `Your teacher sent ${fresh.length} questions back`}
          </DialogTitle>
          <DialogDescription>
            Open the homework and answer these again in your own work.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {fresh.map((alert) => (
            <li
              key={`${alert.answerId}:${alert.rejectedAt}`}
              className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"
            >
              <p className="font-medium">
                {alert.assignmentTitle}
                {alert.questionPosition ? ` — question ${alert.questionPosition}` : ""}
              </p>
              {alert.note ? (
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{alert.note}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(alert.rejectedAt).toLocaleString()}
              </p>
              {alert.assignmentId ? (
                <Link
                  to="/assignments/$assignmentId"
                  params={{ assignmentId: alert.assignmentId }}
                  onClick={dismiss}
                  className="mt-2 inline-block text-sm underline"
                >
                  Open and redo
                </Link>
              ) : null}
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button onClick={dismiss}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
