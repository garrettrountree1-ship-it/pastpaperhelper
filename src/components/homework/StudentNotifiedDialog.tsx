import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmation shown to a teacher after sending a student's answer back to redo.
 * Reassures them the student has been notified in-app.
 */
export function StudentNotifiedDialog({
  open,
  onOpenChange,
  reason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Student notified</DialogTitle>
          <DialogDescription>
            The student has been sent an in-app notification and will see a pop-up
            when they next open the app. The question is marked as needing a redo.
            {reason ? (
              <span className="mt-2 block rounded-lg bg-muted p-2 text-xs">
                Reason: {reason}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
