import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteClassMessage,
  listClassMessages,
  replyToStudent,
} from "@/lib/messaging.functions";

/** System notices (e.g. "Redo question 8 — …") never count as new messages. */
function isSystemMessage(m: { sender_role: string; topic: string | null }) {
  return m.sender_role === "teacher" && /^redo question/i.test((m.topic ?? "").trim());
}

/** Fired when a panel marks messages as read, so any badge elsewhere clears. */
const SEEN_EVENT = "class-messages-seen";

function seenStorageKey(classId: string, role: "teacher" | "student") {
  return `class-messages-seen:${classId}:${role}`;
}

/** Count of unread human messages for one class — used for the tab flag. */
export function useUnreadClassMessages(classId: string, role: "teacher" | "student" = "teacher") {
  const fetchMessages = useServerFn(listClassMessages);
  const messages = useQuery({
    queryKey: ["class-messages", classId],
    queryFn: () => fetchMessages({ data: { classId } }),
    refetchInterval: 60_000,
  });
  const [seenAt, setSeenAt] = useState(0);
  const seenKey = seenStorageKey(classId, role);

  useEffect(() => {
    const read = () => setSeenAt(Number(window.localStorage.getItem(seenKey) ?? 0) || 0);
    read();
    window.addEventListener(SEEN_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(SEEN_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [seenKey]);

  return (messages.data ?? []).filter(
    (m) =>
      (role === "teacher"
        ? m.sender_role === "student"
        : !isSystemMessage(m) && m.sender_role === "teacher") &&
      new Date(m.created_at).getTime() > seenAt,
  ).length;
}

/** Textarea that grows with its content so long replies never run off the end. */
function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(200, el.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && onSubmit) {
          event.preventDefault();
          onSubmit();
        }
      }}
      rows={1}
      placeholder={placeholder}
      className="flex min-h-[40px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
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
  const removeMessage = useServerFn(deleteClassMessage);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Which message each thread's reply is quoting.
  const [quotes, setQuotes] = useState<Record<string, string | null>>({});
  const [open, setOpen] = useState(false);
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const [seenAt, setSeenAt] = useState(0);
  const seenKey = seenStorageKey(classId, role);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(seenKey) ?? 0);
    setSeenAt(Number.isFinite(stored) ? stored : 0);
  }, [seenKey]);

  const send = useMutation({
    mutationFn: (vars: { studentId: string; body: string; replyToId: string | null }) =>
      reply({
        data: {
          classId,
          studentId: vars.studentId,
          topic: "",
          body: vars.body,
          replyToId: vars.replyToId,
        },
      }),
    onSuccess: (_result, vars) => {
      setDrafts((prev) => ({ ...prev, [vars.studentId]: "" }));
      setQuotes((prev) => ({ ...prev, [vars.studentId]: null }));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeMessage({ data: { id } }),
    onSuccess: () => {
      toast.success("Message deleted");
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
    window.dispatchEvent(new Event(SEEN_EVENT));
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
                      {thread.map((m) => {
                        const quoted = m.reply_to_id
                          ? thread.find((item) => item.id === m.reply_to_id)
                          : null;
                        // Teachers may delete either side; students only their own.
                        const canDelete =
                          role === "teacher" || m.sender_role === "student";
                        return (
                        <div
                          key={m.id}
                          className={
                            m.sender_role === "teacher"
                              ? "rounded-md bg-primary/10 p-2 text-sm"
                              : "rounded-md bg-muted p-2 text-sm"
                          }
                        >
                          <div className="flex items-start gap-2">
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
                          <div className="ml-auto flex shrink-0 items-center gap-1">
                            {role === "teacher" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 gap-1 px-2 text-xs"
                                title="Quote this message in your reply"
                                onClick={() => {
                                  setQuotes((prev) => ({ ...prev, [studentId]: m.id }));
                                  setOpenThreads((prev) => ({ ...prev, [studentId]: true }));
                                }}
                              >
                                <Quote className="size-3" />
                                Quote
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                                title="Delete this message for everyone"
                                disabled={remove.isPending}
                                onClick={() => remove.mutate(m.id)}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            ) : null}
                          </div>
                          </div>
                          {quoted ? (
                            <div className="mt-2 border-l-2 border-primary/40 pl-2">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                Quoting{" "}
                                {quoted.sender_role === "teacher"
                                  ? role === "teacher"
                                    ? "you"
                                    : "your teacher"
                                  : role === "teacher"
                                    ? name
                                    : "you"}
                              </p>
                              <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                                {quoted.body}
                              </p>
                            </div>
                          ) : null}
                          {m.questionText ? (
                            <div className="mt-2 rounded-md border border-border bg-background/70 p-2">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {m.questionPosition
                                  ? `Question ${m.questionPosition}`
                                  : "Question"}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                                {m.questionText}
                              </p>
                            </div>
                          ) : null}
                          <p className="mt-2 whitespace-pre-wrap">{m.body}</p>
                        </div>
                        );
                      })}
                    </div>
                    {role === "teacher" ? (
                      <>
                      {quotes[studentId] ? (
                        <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2">
                          <div className="min-w-0 border-l-2 border-primary/40 pl-2">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Quoting
                            </p>
                            <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                              {thread.find((m) => m.id === quotes[studentId])?.body}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-6 px-2 text-xs"
                            onClick={() => setQuotes((prev) => ({ ...prev, [studentId]: null }))}
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      ) : null}
                      <div className="mt-3 flex items-end gap-2">
                        <AutoResizeTextarea
                          value={drafts[studentId] ?? ""}
                          onChange={(value) =>
                            setDrafts((prev) => ({ ...prev, [studentId]: value }))
                          }
                          placeholder="Reply to this student"
                          onSubmit={() =>
                            send.mutate({
                              studentId,
                              body: (drafts[studentId] ?? "").trim(),
                              replyToId: quotes[studentId] ?? null,
                            })
                          }
                        />
                        <Button
                          onClick={() =>
                            send.mutate({
                              studentId,
                              body: (drafts[studentId] ?? "").trim(),
                              replyToId: quotes[studentId] ?? null,
                            })
                          }
                          disabled={
                            (drafts[studentId] ?? "").trim().length === 0 || send.isPending
                          }
                        >
                          Reply
                        </Button>
                      </div>
                      </>
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
