import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** One-click reasons a teacher can pick instead of typing. */
export const REJECT_REASONS = [
  "This looks like AI-written work — answer it in your own words.",
  "This photo isn't your own hand-drawn work — redo it by hand.",
  "This answer is copied from another student or a website.",
  "Your working is missing — show the steps you used.",
  "The answer is too vague — use the key terms and explain why.",
  "The photo is unreadable — take a clearer picture.",
];

/**
 * Reason picker shown when a teacher sends a question back: tap a common reason,
 * type your own, or send it back with no reason at all.
 */
export function RejectReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
  title = "Send this question back to redo",
  description = "Pick a reason or write your own. The student sees it on the question and in a pop-up. Leave it blank to send it back with no reason.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string) => void;
  busy?: boolean;
  title?: string;
  description?: string;
}) {
  const [note, setNote] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setNote("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {REJECT_REASONS.map((reason) => (
            <Button
              key={reason}
              type="button"
              size="sm"
              variant={note === reason ? "default" : "outline"}
              className="h-auto whitespace-normal py-1.5 text-left text-xs"
              onClick={() => setNote(note === reason ? "" : reason)}
            >
              {reason}
            </Button>
          ))}
        </div>

        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 600))}
          placeholder="Optional: write your own reason for the student."
          rows={3}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(note.trim())} disabled={busy}>
            {busy ? "Sending..." : "Send back to redo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
