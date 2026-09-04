import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { removeStudentFromClass } from "@/lib/app.functions";

/** Teacher control that deletes a student and every piece of their data. */
export function RemoveStudentButton({
  classId,
  studentId,
  studentName,
  onRemoved,
}: {
  classId: string;
  studentId: string;
  studentName: string;
  onRemoved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const remove = useServerFn(removeStudentFromClass);

  const mutation = useMutation({
    mutationFn: () => remove({ data: { classId, studentId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-roster", classId] });
      queryClient.invalidateQueries({ queryKey: ["class-overview", classId] });
      queryClient.invalidateQueries({ queryKey: ["teacher-classes"] });
      setOpen(false);
      onRemoved?.();
      toast.success("Student removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        Remove
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {studentName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? All data on this student will be deleted — homework submissions,
              answers, tutor chats, quiz attempts, grades, messages and their account on the
              platform. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                mutation.mutate();
              }}
            >
              {mutation.isPending ? "Deleting…" : "Delete student and all data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
