import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askLessonTutor } from "@/lib/notes.functions";

type Turn = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "I don't understand this section — where should I start?",
  "Can you check what I've understood so far?",
  "Give me a leading question on this topic.",
];

/**
 * Always-visible lesson tutor. It never shows an empty box: there is always a
 * prompt on screen, and every reply ends with a leading diagnostic question.
 */
export function LessonTutorBar({
  classId,
  sectionId,
  concept,
  onConceptHandled,
}: {
  classId: string;
  sectionId: string | null;
  concept: string | null;
  onConceptHandled: () => void;
}) {
  const ask = useServerFn(askLessonTutor);
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      content:
        "I'm your lesson tutor. Tell me what you're working on, or click any concept in the notes or the document and I'll start from there. To begin: which part of this section feels least clear right now?",
    },
  ]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const send = useMutation({
    mutationFn: async (input: { question: string; concept?: string }) => {
      const history = turns.slice(-8);
      const { reply } = await ask({
        data: {
          classId,
          sectionId,
          question: input.question,
          concept: input.concept ?? null,
          history,
        },
      });
      return reply;
    },
    onSuccess: (reply) => setTurns((prev) => [...prev, { role: "assistant", content: reply }]),
    onError: (error: Error) => toast.error(error.message),
  });

  function submit(question: string, conceptText?: string) {
    const trimmed = question.trim();
    if (!trimmed || send.isPending) return;
    setTurns((prev) => [...prev, { role: "user", content: trimmed }]);
    setDraft("");
    send.mutate({ question: trimmed, ...(conceptText ? { concept: conceptText } : {}) });
  }

  // A clicked concept from either side of the split screen starts a tutor turn.
  useEffect(() => {
    if (!concept) return;
    submit(`Explain this concept from the lesson: "${concept}"`, concept);
    onConceptHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, send.isPending]);

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Sparkles className="size-4 text-accent" />
        <p className="text-sm font-medium">AI lesson tutor</p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {turns.map((turn, index) => (
          <div
            key={index}
            className={
              turn.role === "user"
                ? "ml-6 rounded-md bg-secondary px-3 py-2 text-sm"
                : "rounded-md border px-3 py-2 text-sm whitespace-pre-wrap"
            }
          >
            {turn.content}
          </div>
        ))}
        {send.isPending ? (
          <p className="text-xs text-muted-foreground">Thinking about your next step…</p>
        ) : null}
      </div>

      <div className="space-y-2 border-t p-3">
        <div className="flex flex-wrap gap-1">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => submit(starter)}
              className="rounded-full border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-primary"
            >
              {starter}
            </button>
          ))}
        </div>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(draft);
            }
          }}
          placeholder="Ask about anything in this lesson…"
          className="min-h-[64px] text-sm"
        />
        <Button
          size="sm"
          className="w-full"
          onClick={() => submit(draft)}
          disabled={!draft.trim() || send.isPending}
        >
          <Send className="size-4" />
          Ask the tutor
        </Button>
      </div>
    </aside>
  );
}
