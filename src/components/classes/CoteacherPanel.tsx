import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { addCoteacher, listCoteachers, removeCoteacher } from "@/lib/coteachers.functions";

/**
 * Class owner adds other teachers to help run the class. Coteachers get the
 * same teaching access (homework, materials, quizzes, games, gradebook) but
 * only the owner can change who teaches.
 */
export function CoteacherPanel({ classId }: { classId: string }) {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listCoteachers);
  const add = useServerFn(addCoteacher);
  const remove = useServerFn(removeCoteacher);
  const [email, setEmail] = useState("");

  const list = useQuery({
    queryKey: ["coteachers", classId],
    queryFn: () => fetchList({ data: { classId } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["coteachers", classId] });

  const addMutation = useMutation({
    mutationFn: (value: string) => add({ data: { classId, email: value } }),
    onSuccess: (result) => {
      setEmail("");
      toast.success(`${result.name ?? "Teacher"} can now coteach this class.`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (teacherId: string) => remove({ data: { classId, teacherId } }),
    onSuccess: () => {
      toast.success("Coteacher removed.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const isOwner = list.data?.isOwner ?? false;
  const coteachers = list.data?.coteachers ?? [];

  return (
    <section className="paper mt-6 p-6">
      <div className="mb-2 flex items-center gap-2">
        <UserPlus className="size-5 text-primary" />
        <h2 className="font-display text-xl">Teachers for this class</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Coteachers see and manage everything in this class — homework, quizzes, lesson materials,
        games and the gradebook. Only you, the class creator, can add or remove them.
      </p>

      {list.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <ul className="mb-4 space-y-2 text-sm">
          {list.data?.owner ? (
            <li className="flex items-center justify-between rounded border border-border px-3 py-2">
              <span>
                {list.data.owner.name}
                <span className="ml-2 text-xs text-muted-foreground">Class creator</span>
              </span>
            </li>
          ) : null}
          {coteachers.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded border border-border px-3 py-2"
            >
              <span>
                {t.name}
                <span className="ml-2 text-xs text-muted-foreground">Coteacher</span>
              </span>
              {isOwner ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${t.name}`}
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(t.teacherId)}
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
          {coteachers.length === 0 ? (
            <li className="text-muted-foreground">No coteachers yet.</li>
          ) : null}
        </ul>
      )}

      {isOwner ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim()) addMutation.mutate(email.trim());
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Add text here — teacher's account email *"
            className="sm:max-w-sm"
          />
          <Button type="submit" disabled={!email.trim() || addMutation.isPending}>
            {addMutation.isPending ? "Adding…" : "Add coteacher"}
          </Button>
        </form>
      ) : null}
      {isOwner ? (
        <p className="mt-2 text-xs text-muted-foreground">
          The teacher must already have a PastPaperHelper.AI account with that email.
        </p>
      ) : null}
    </section>
  );
}
