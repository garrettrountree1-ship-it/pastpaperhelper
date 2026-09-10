import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Quote, Trash2, X } from "lucide-react";
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
import {
  deleteClassMessage,
  listMyMessages,
  sendMessageToTeacher,
} from "@/lib/messaging.functions";

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
  const [quoteId, setQuoteId] = useState<string | null>(null);

  const messages = useQuery({
    queryKey: ["my-messages"],
    queryFn: useServerFn(listMyMessages),
    enabled: open,
  });
  const send = useServerFn(sendMessageToTeacher);
  const removeMessage = useServerFn(deleteClassMessage);
  const mutation = useMutation({
    mutationFn: () =>
      send({
        data: {
          classId,
          assignmentId: assignmentId || preset?.assignmentId || null,
          questionId: preset?.questionId ?? null,
          topic: topic.trim(),
          body: body.trim(),
          replyToId: quoteId,
        },
      }),
    onSuccess: () => {
      setBody("");
      setQuoteId(null);
      toast.success("Message sent to your teacher");
      queryClient.invalidateQueries({ queryKey: ["my-messages"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Students may remove their own messages only, never the teacher's. */
  const remove = useMutation({
    mutationFn: (id: string) => removeMessage({ data: { id } }),
    onSuccess: (_r, id) => {
      if (quoteId === id) setQuoteId(null);
      toast.success("Message deleted");
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
              {thread.map((m) => {
                const quoted = m.reply_to_id
                  ? thread.find((item) => item.id === m.reply_to_id)
                  : null;
                return (
                <div
                  key={m.id}
                  className={
                    m.sender_role === "teacher"
                      ? "rounded-lg bg-primary/10 p-2 text-sm"
                      : "rounded-lg bg-muted p-2 text-sm"
                  }
                >
                  <div className="flex items-start gap-2">
                    <p className="text-xs text-muted-foreground">
                      {m.sender_role === "teacher" ? "Teacher" : "You"}
                      {m.topic ? ` · ${m.topic}` : ""}
                    </p>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-2 text-xs"
                        title="Quote this message in your reply"
                        onClick={() => setQuoteId(m.id)}
                      >
                        <Quote className="size-3" />
                        Quote
                      </Button>
                      {m.sender_role === "student" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                          title="Delete your message"
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
                        Quoting {quoted.sender_role === "teacher" ? "your teacher" : "you"}
                      </p>
                      <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                        {quoted.body}
                      </p>
                    </div>
                  ) : null}
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                </div>
                );
              })}
            </div>
          ) : null}

          {quoteId ? (
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2">
              <div className="min-w-0 border-l-2 border-primary/40 pl-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Quoting
                </p>
                <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {thread.find((m) => m.id === quoteId)?.body}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-xs"
                onClick={() => setQuoteId(null)}
              >
                <X className="size-3" />
              </Button>
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
