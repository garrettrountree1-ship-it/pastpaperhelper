import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listClassMessages, replyToStudent } from "@/lib/messaging.functions";

/** Private teacher ↔ student threads for one class, grouped by student. */
export function TeacherMessagesPanel({ classId }: { classId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["class-messages", classId];
  const fetchMessages = useServerFn(listClassMessages);
  const messages = useQuery({
    queryKey,
    queryFn: () => fetchMessages({ data: { classId } }),
  });
  const reply = useServerFn(replyToStudent);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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

  return (
    <section className="paper mt-6 p-6">
      <div className="mb-2 flex items-center gap-2">
        <MessageSquare className="size-5 text-primary" />
        <h2 className="font-display text-xl">Teacher messages</h2>
        <span className="text-sm text-muted-foreground">
          {messages.isPending ? "" : `· ${studentIds.length}`}
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Students message you about a specific question. Students never see each other&apos;s
        messages.
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
            return (
              <div key={studentId} className="rounded-lg border border-border p-3">
                <p className="font-medium">{name}</p>
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
                        {m.sender_role === "teacher" ? "You" : name}
                        {m.topic ? ` · ${m.topic}` : ""} ·{" "}
                        {new Date(m.created_at).toLocaleString()}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))}
                </div>
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
                    disabled={(drafts[studentId] ?? "").trim().length === 0 || send.isPending}
                  >
                    Reply
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
