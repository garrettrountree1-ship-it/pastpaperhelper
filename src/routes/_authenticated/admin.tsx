import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminOverview, replySupportMessage } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Platform admin · STEM Homework AI" },
      { name: "description", content: "Accounts, email list and time spent in each section." },
      { property: "og:title", content: "Platform admin · STEM Homework AI" },
      {
        property: "og:description",
        content: "Accounts, email list and time spent in each section.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

function AdminPage() {
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: useServerFn(getAdminOverview),
    retry: false,
  });

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="font-display text-3xl">Platform admin</h1>
        {overview.isLoading ? (
          <Skeleton className="mt-4 h-64 w-full" />
        ) : overview.isError ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {(overview.error as Error).message}
          </p>
        ) : overview.data ? (
          <div className="mt-4 space-y-6">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Accounts", overview.data.counts.users],
                ["Teachers", overview.data.counts.teachers],
                ["Students", overview.data.counts.students],
                ["Classes", overview.data.counts.classes],
                ["Enrolments", overview.data.counts.enrolments],
                ["Active today", overview.data.counts.activeToday],
              ].map(([label, value]) => (
                <div key={String(label)} className="paper p-4">
                  <p className="text-xs uppercase text-muted-foreground">{label}</p>
                  <p className="font-display text-2xl">{value}</p>
                </div>
              ))}
            </div>

            <section className="paper p-5">
              <h2 className="font-display text-2xl">Time spent per section</h2>
              <div className="mt-2 divide-y">
                {overview.data.sectionTotals.map((row) => (
                  <div key={row.section} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>{row.label}</span>
                    <span className="text-muted-foreground">
                      {formatDuration(row.totalSeconds)} total · {formatDuration(row.weekSeconds)} this
                      week · {row.users} user{row.users === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="paper p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <h2 className="font-display text-2xl">Accounts &amp; email list</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const emails = overview.data.users.map((u) => u.email).filter(Boolean).join(", ");
                    navigator.clipboard
                      .writeText(emails)
                      .then(() => toast.success("Email list copied"))
                      .catch(() => toast.error("Copy failed"));
                  }}
                >
                  Copy all emails
                </Button>
              </div>
              <div className="divide-y">
                {overview.data.users.map((user) => (
                  <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium">{user.name}</span>{" "}
                      <span className="text-muted-foreground">{user.email}</span>
                    </span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Badge variant="outline">{user.role}</Badge>
                      {formatDuration(user.totalSeconds)}
                      {user.activeToday ? <Badge variant="secondary">active today</Badge> : null}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="paper p-5">
              <h2 className="font-display text-2xl">Support messages</h2>
              {overview.data.support.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                <div className="mt-2 divide-y">
                  {overview.data.support.map((message) => (
                    <SupportRow key={message.id} message={message} />
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function SupportRow({
  message,
}: {
  message: { id: string; email: string; body: string; reply: string | null };
}) {
  const [reply, setReply] = useState("");
  const queryClient = useQueryClient();
  const send = useServerFn(replySupportMessage);
  const mutation = useMutation({
    mutationFn: () => send({ data: { id: message.id, reply } }),
    onSuccess: () => {
      toast.success("Reply sent");
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="py-3 text-sm">
      <p className="font-medium">{message.email}</p>
      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{message.body}</p>
      {message.reply ? (
        <p className="mt-2 rounded-md bg-muted p-2">Reply: {message.reply}</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <Input
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder="Write a reply"
          />
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || reply.trim().length === 0}
          >
            Send
          </Button>
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
