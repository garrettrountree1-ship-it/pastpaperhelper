import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Megaphone, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDueDate } from "@/lib/datetime";
import {
  deleteAnnouncement,
  listClassBulletin,
  postAnnouncement,
} from "@/lib/messaging.functions";

/** Teacher bulletin board for one class: post, review and delete notices. */
export function ClassBulletinPanel({ classId }: { classId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["class-bulletin", classId];
  const fetchPosts = useServerFn(listClassBulletin);
  const posts = useQuery({
    queryKey,
    queryFn: () => fetchPosts({ data: { classId } }),
  });
  const post = useServerFn(postAnnouncement);
  const remove = useServerFn(deleteAnnouncement);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: () => post({ data: { classId, title: title.trim(), body: body.trim() } }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      toast.success("Posted to the class bulletin");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) => toast.error(error.message),
  });

  const postCount = (posts.data ?? []).length;

  return (
    <section className="paper mt-6 p-6">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Megaphone className="size-5 text-primary" />
          <h2 className="font-display text-xl">Class bulletin</h2>
          <span className="text-sm text-muted-foreground">· {postCount}</span>
        </div>
        <ChevronDown
          className={`size-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <p className="mt-1 text-sm text-muted-foreground">
        Every student in this class sees these notices as a pop-up on their class home page. They
        cannot reply.
      </p>
      {open ? (
        <>
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="bulletin-title">Title (optional)</Label>
              <Input
                id="bulletin-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Reminder"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulletin-body">Message</Label>
              <Textarea
                id="bulletin-body"
                rows={3}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Paper 4 homework is due Friday — bring your working."
              />
            </div>
            <Button
              onClick={() => create.mutate()}
              disabled={body.trim().length === 0 || create.isPending}
            >
              Post to class
            </Button>
          </div>

          <div className="mt-6 space-y-3">
            {posts.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : (posts.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No bulletin posts yet.</p>
            ) : (
              (posts.data ?? []).map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {item.title ? <p className="font-medium">{item.title}</p> : null}
                      <p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatDueDate(item.created_at)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => del.mutate(item.id)}
                      disabled={del.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

/** Read-only bulletin box shown open on a student's class home page. */
export function ClassBulletinBoard({ classId }: { classId: string }) {
  const fetchPosts = useServerFn(listClassBulletin);
  const posts = useQuery({
    queryKey: ["class-bulletin", classId],
    queryFn: () => fetchPosts({ data: { classId } }),
  });
  const [seenAt, setSeenAt] = useState<number | null>(null);
  const seenKey = `class-bulletin-seen:${classId}`;
  const rows = posts.data ?? [];
  const latest = rows.reduce((max, p) => Math.max(max, new Date(p.created_at).getTime()), 0);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(seenKey) ?? 0);
    setSeenAt(Number.isFinite(stored) ? stored : 0);
  }, [seenKey]);

  // Note: the "seen" marker is only written when the student dismisses the
  // bulletin pop-up, so new notices keep popping up until acknowledged.


  return (
    <section className="paper mt-6 p-6">
      <div className="flex items-center gap-2">
        <Megaphone className="size-5 text-primary" />
        <h2 className="font-display text-xl">Class bulletin</h2>
        <span className="text-sm text-muted-foreground">· {rows.length}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Notices from your teacher. You cannot reply to bulletin posts.
      </p>
      <div className="mt-4 space-y-3">
        {posts.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notices yet.</p>
        ) : (
          rows.map((item) => {
            const isNew = seenAt !== null && new Date(item.created_at).getTime() > seenAt;
            return (
              <div
                key={item.id}
                className={`rounded-lg border p-3 ${isNew ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {item.title ? <p className="font-medium">{item.title}</p> : null}
                    <p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDueDate(item.created_at)}
                    </p>
                  </div>
                  {isNew ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                      New
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

/** Read-only bulletin pop-up shown to a student when they open their class home page. */
export function ClassBulletinPopup({ classId }: { classId: string }) {
  const fetchPosts = useServerFn(listClassBulletin);
  const posts = useQuery({
    queryKey: ["class-bulletin", classId],
    queryFn: () => fetchPosts({ data: { classId } }),
  });
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<number | null>(null);
  const seenKey = `class-bulletin-seen:${classId}`;
  const rows = posts.data ?? [];
  const latest = rows.reduce((max, p) => Math.max(max, new Date(p.created_at).getTime()), 0);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(seenKey) ?? 0);
    setSeenAt(Number.isFinite(stored) ? stored : 0);
  }, [seenKey]);

  useEffect(() => {
    if (seenAt === null || latest === 0) return;
    if (latest > seenAt) setOpen(true);
  }, [seenAt, latest]);

  function dismiss() {
    if (latest > 0) window.localStorage.setItem(seenKey, String(latest));
    setSeenAt(latest);
    setOpen(false);
  }

  if (rows.length === 0) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="size-5 text-primary" />
              Class bulletin
            </DialogTitle>
            <DialogDescription>
              A notice from your teacher. You cannot reply to bulletin posts.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {rows.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                {item.title ? <p className="font-medium">{item.title}</p> : null}
                <p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDueDate(item.created_at)}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={dismiss}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>

  );
}
