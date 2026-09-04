import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listClassMessages, replyToStudent } from "@/lib/messaging.functions";

/** System notices (e.g. "Redo question 8 — …") never count as new messages. */
function isSystemMessage(m: { sender_role: string; topic: string | null }) {
  return m.sender_role === "teacher" && /^redo question/i.test((m.topic ?? "").trim());
}

/** Private teacher ↔ student threads for one class, grouped by student. */
export function TeacherMessagesPanel({
  classId,
  role = "teacher",
}: {
  classId: string;
  role?: "teacher" | "student";
}) {
  const queryClient = useQueryClient();
  const queryKey = ["class-messages", classId];
  const fetchMessages = useServerFn(listClassMessages);
  const messages = useQuery({
    queryKey,
    queryFn: () => fetchMessages({ data: { classId } }),
  });
  const reply = useServerFn(replyToStudent);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const seenKey = `class-messages-seen:${classId}:${role}`;

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(seenKey) ?? 0);
    setSeenAt(Number.isFinite(stored) ? stored : 0);
  }, [seenKey]);

  const send = useMutation({
    mutationFn: (vars: { studentId: string; body: string }) =>
      reply({ data: { classId, studentId: vars.studentId, topic: "", body: vars.body } }),
    onSuccess: (_result, vars) => {
      setDrafts((prev) => ({ ...prev, [vars.studentId]: "" }));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = messages.data ?? [];
  const studentIds = [...new Set(rows.map((m) => m.student_id))];
  // Only human-typed messages from the other party count as new.
  const incoming = rows.filter((m) =>
    role === "teacher" ? m.sender_role === "student" : !isSystemMessage(m) && m.sender_role === "teacher",
  );
  const unread = incoming.filter((m) => new Date(m.created_at).getTime() > seenAt).length;

  function markSeen() {
    const latest = incoming.reduce(
      (max, m) => Math.max(max, new Date(m.created_at).getTime()),
      0,
    );
    if (latest > 0) window.localStorage.setItem(seenKey, String(latest));
    setSeenAt(latest);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) markSeen();
  }

  return (
    <section className="paper mt-6 p-6">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
        <MessageSquare className="size-5 text-primary" />
        <h2 className="font-display text-xl">
          {role === "teacher" ? "Student messages" : "Teacher messages"}
        </h2>
        <span className="text-sm text-muted-foreground">
          {messages.isPending ? "" : `· ${studentIds.length}`}
        </span>
        {unread > 0 ? (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            {unread} new
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <p className="mt-3 mb-4 text-sm text-muted-foreground">
            {role === "teacher"
              ? "Students message you about a specific question. Students never see each other's messages."
              : "Messages between you and your teacher about a specific question."}
          </p>
          {messages.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : studentIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            <div className="space-y-4">
              {studentIds.map((studentId) => {
                const thread = rows.filter((m) => m.student_id === studentId);
                const name = thread[0]?.studentName ?? "Student";
                const threadOpen = openThreads[studentId] ?? false;
                return (
                  <div key={studentId} className="rounded-lg border border-border p-3">
                    <button
                      type="button"
                      aria-expanded={threadOpen}
                      onClick={() =>
                        setOpenThreads((prev) => ({ ...prev, [studentId]: !threadOpen }))
                      }
                      className="flex w-full items-center gap-2 text-left"
                    >
                      {threadOpen ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">
                        {role === "teacher" ? name : "Your teacher"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {thread.length} {thread.length === 1 ? "message" : "messages"}
                      </span>
                    </button>
                    {threadOpen ? (
                      <>
                    <div className="mt-2 space-y-2">
                      {thread.map((m) => (
                        <div
                          key={m.id}
                          className={
                            m.sender_role === "teacher"
                              ? "rounded-md bg-primary/10 p-2 text-sm"
                              : "rounded-md bg-muted p-2 text-sm"
                          }
                        >
                          <p className="text-xs text-muted-foreground">
                            {m.sender_role === "teacher"
                              ? role === "teacher"
                                ? "You"
                                : "Teacher"
                              : role === "teacher"
                                ? name
                                : "You"}
                            {m.topic ? ` · ${m.topic}` : ""} ·{" "}
                            {new Date(m.created_at).toLocaleString()}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                        </div>
                      ))}
                    </div>
                    {role === "teacher" ? (
                      <div className="mt-3 flex gap-2">
                        <Input
                          value={drafts[studentId] ?? ""}
                          onChange={(event) =>
                            setDrafts((prev) => ({ ...prev, [studentId]: event.target.value }))
                          }
                          placeholder="Reply to this student"
                        />
                        <Button
                          onClick={() =>
                            send.mutate({ studentId, body: (drafts[studentId] ?? "").trim() })
                          }
                          disabled={
                            (drafts[studentId] ?? "").trim().length === 0 || send.isPending
                          }
                        >
                          Reply
                        </Button>
                      </div>
                    ) : null}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
