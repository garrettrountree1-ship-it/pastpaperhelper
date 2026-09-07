import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { TeacherIcon } from "@/components/assignments/QuestionHelpDialog";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listMyMessages, sendMessageToTeacher } from "@/lib/messaging.functions";

/**
 * Student → teacher messaging. Students can only ever message the teacher of a
 * class, never another student. A question reference is required before the
 * message box unlocks.
 */
export function MessageTeacherDialog({
  classId,
  className,
  assignmentOptions = [],
  preset,
  trigger,
}: {
  classId: string;
  className: string;
  assignmentOptions?: Array<{ id: string; title: string }>;
  preset?: { assignmentId?: string | null; questionId?: string | null; topic: string };
  trigger?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [assignmentId, setAssignmentId] = useState(preset?.assignmentId ?? "");
  const [topic, setTopic] = useState(preset?.topic ?? "");
  const [body, setBody] = useState("");

  const messages = useQuery({
    queryKey: ["my-messages"],
    queryFn: useServerFn(listMyMessages),
    enabled: open,
  });
  const send = useServerFn(sendMessageToTeacher);
  const mutation = useMutation({
    mutationFn: () =>
      send({
        data: {
          classId,
          assignmentId: assignmentId || preset?.assignmentId || null,
          questionId: preset?.questionId ?? null,
          topic: topic.trim(),
          body: body.trim(),
        },
      }),
    onSuccess: () => {
      setBody("");
      toast.success("Message sent to your teacher");
      queryClient.invalidateQueries({ queryKey: ["my-messages"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const thread = (messages.data ?? []).filter((m) => m.class_id === classId);
  const topicReady = topic.trim().length > 1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="gap-1.5 px-2" title="Ask the teacher">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
              <TeacherIcon className="size-3.5" />
            </span>
            <span className="hidden sm:inline">Ask the teacher</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Message your teacher · {className}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {thread.length > 0 ? (
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
              {thread.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.sender_role === "teacher"
                      ? "rounded-lg bg-primary/10 p-2 text-sm"
                      : "rounded-lg bg-muted p-2 text-sm"
                  }
                >
                  <p className="text-xs text-muted-foreground">
                    {m.sender_role === "teacher" ? "Teacher" : "You"}
                    {m.topic ? ` · ${m.topic}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}
            </div>
          ) : null}

          {assignmentOptions.length > 0 && !preset?.assignmentId ? (
            <div className="space-y-2">
              <Label>Which homework?</Label>
              <Select value={assignmentId} onValueChange={setAssignmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose the homework (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {assignmentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="message-topic">What question are you messaging about?</Label>
            <Input
              id="message-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="e.g. Question 3(b) — the rate graph"
              readOnly={Boolean(preset?.topic)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message-body">Your message</Label>
            <Textarea
              id="message-body"
              rows={4}
              value={body}
              disabled={!topicReady}
              onChange={(event) => setBody(event.target.value)}
              placeholder={
                topicReady
                  ? "Write your message in English"
                  : "First say which question you are messaging about"
              }
            />
            <p className="text-xs text-muted-foreground">
              Only your teacher can read this. You can&apos;t message other students.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!topicReady || body.trim().length === 0 || mutation.isPending}
          >
            {mutation.isPending ? "Sending…" : "Send to teacher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
