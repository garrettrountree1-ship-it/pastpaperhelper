import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { formatDueDate } from "@/lib/datetime";
import {
  assignmentStatus,
  statusBadgeVariant,
  statusLabels,
  type AssignmentStatusKey,
} from "@/lib/assignment-status";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  createClass,
  getMe,
  joinClass,
  listStudentWork,
  listTeacherClasses,
  setOAuthRole,
} from "@/lib/app.functions";
import { useDemoView } from "@/lib/demo-view";
import { listStudentBulletins } from "@/lib/messaging.functions";
import { MessageTeacherDialog } from "@/components/messaging/MessageTeacherDialog";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · STEM Homework AI" },
      { name: "description", content: "Your classes, assignments and homework grades." },
      { property: "og:title", content: "Dashboard · STEM Homework AI" },
      { property: "og:description", content: "Your classes, assignments and homework grades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
  pendingComponent: () => (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="h-40 w-full" />
      </main>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 text-center">
        <p className="mb-4 text-muted-foreground">
          We couldn&apos;t load your dashboard. {error.message}
        </p>
        <Button onClick={reset}>Try again</Button>
      </main>
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

const PENDING_OAUTH_ROLE_KEY = "pendingOAuthRole";

function Dashboard() {
  const me = useQuery({ queryKey: ["me"], queryFn: useServerFn(getMe), retry: 2 });
  const queryClient = useQueryClient();
  const setRole = useServerFn(setOAuthRole);
  const roleMutation = useMutation({
    mutationFn: async (role: "teacher" | "student") => {
      const result = await setRole({ data: { role } });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (me.isPending) return;
    try {
      const pendingRole = localStorage.getItem(PENDING_OAUTH_ROLE_KEY) as "teacher" | "student" | null;
      if (!pendingRole) return;
      localStorage.removeItem(PENDING_OAUTH_ROLE_KEY);
      if (pendingRole !== me.data?.role) {
        roleMutation.mutate(pendingRole);
      }
    } catch {
      // ignore storage errors
    }
  }, [me.isPending, me.data?.role, roleMutation]);

  const isDemo = Boolean(me.data?.isDemo);
  const { view, setDemoView } = useDemoView(isDemo, me.data?.role ?? "student");
  const effectiveRole = isDemo ? view : me.data?.role;

  return (
    <div className="min-h-screen">
      <AppHeader name={me.data?.fullName || me.data?.email} role={effectiveRole} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {isDemo ? <DemoViewSwitcher role={view} onSwitch={setDemoView} /> : null}
        {me.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : me.isError ? (
          <div className="text-center">
            <p className="mb-4 text-muted-foreground">
              We couldn&apos;t load your account. {me.error.message}
            </p>
            <Button onClick={() => me.refetch()}>Retry</Button>
          </div>
        ) : effectiveRole === "teacher" ? (
          <TeacherHome />
        ) : (
          <StudentHome />
        )}
      </main>
    </div>
  );
}

function DemoViewSwitcher({
  role,
  onSwitch,
}: {
  role: "teacher" | "student";
  onSwitch: (next: "teacher" | "student") => void;
}) {
  const queryClient = useQueryClient();
  const switchRole = (next: "teacher" | "student") => {
    onSwitch(next);
    queryClient.invalidateQueries();
    toast.success(next === "teacher" ? "Teacher view" : "Student view");
  };

  return (
    <div className="paper mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="max-w-xl">
        <p className="font-display text-lg">Demo account — teacher &amp; student in one</p>
        <p className="text-sm text-muted-foreground">
          You are currently in the{" "}
          <span className="font-medium text-foreground">{role} view</span>. Switch back and forth to
          see both sides of STEM Homework AI. This dual view exists only in this demo account —
          real accounts are either a teacher or a student, never both.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant={role === "teacher" ? "default" : "outline"} onClick={() => switchRole("teacher")}>
          Teacher view
        </Button>
        <Button variant={role === "student" ? "default" : "outline"} onClick={() => switchRole("student")}>
          Student view
        </Button>
      </div>
    </div>
  );
}



function TeacherHome() {
  const queryClient = useQueryClient();
  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: useServerFn(listTeacherClasses),
  });
  const create = useServerFn(createClass);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [curriculum, setCurriculum] = useState("IGCSE");

  const mutation = useMutation({
    mutationFn: () => create({ data: { name, curriculum, subject } }),
    onSuccess: () => {
      toast.success("Class created");
      setOpen(false);
      setName("");
      setSubject("");
      queryClient.invalidateQueries({ queryKey: ["teacher-classes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div className="paper flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h1 className="text-3xl">Your classes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a class, share the join code, then set past-paper homework.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>New class</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New class</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="class-name">Class name</Label>
                <Input
                  id="class-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Year 11 Chemistry"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="class-subject">Subject</Label>
                <Input
                  id="class-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Chemistry"
                />
              </div>
              <div className="space-y-2">
                <Label>Curriculum</Label>
                <Select value={curriculum} onValueChange={setCurriculum}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IGCSE">IGCSE</SelectItem>
                    <SelectItem value="A-Level">A-Level</SelectItem>
                    <SelectItem value="IB">IB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => mutation.mutate()}
                disabled={!name.trim() || mutation.isPending}
              >
                Create class
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {classes.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (classes.data ?? []).length === 0 ? (
        <div className="paper p-8 text-center text-muted-foreground">
          No classes yet. Create your first class to get started.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(classes.data ?? []).map((klass) => (
            <Link
              key={klass.id}
              to="/classes/$classId"
              params={{ classId: klass.id }}
              className="paper block p-5 transition-shadow hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-xl">{klass.name}</h2>
                <Badge variant="secondary">{klass.curriculum}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{klass.subject}</p>
              <p className="mt-4 text-sm text-muted-foreground">
                {klass.studentCount} students · {klass.assignmentCount} assignments
              </p>
              <p className="mt-3 font-mono text-sm">
                Code: <span className="highlight-underline">{klass.join_code}</span>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StudentHome() {
  const queryClient = useQueryClient();
  const work = useQuery({ queryKey: ["student-work"], queryFn: useServerFn(listStudentWork) });
  const bulletins = useQuery({
    queryKey: ["student-bulletins"],
    queryFn: useServerFn(listStudentBulletins),
  });
  const join = useServerFn(joinClass);
  const [code, setCode] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AssignmentStatusKey>("all");

  const mutation = useMutation({
    mutationFn: () => join({ data: { code } }),
    onSuccess: (result) => {
      toast.success(`Joined ${result.name}`);
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["student-work"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div className="paper flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h1 className="text-3xl">Your homework</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Answer each question, then work with the tutor on anything you get wrong.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="join-code">Class code</Label>
            <Input
              id="join-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABC123"
              className="w-32 font-mono"
            />
          </div>
          <Button onClick={() => mutation.mutate()} disabled={code.length < 4 || mutation.isPending}>
            Join class
          </Button>
        </div>
      </div>

      {work.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (work.data?.classes ?? []).length === 0 ? (
        <div className="paper p-8 text-center text-muted-foreground">
          No homework yet. Join your class with the code your teacher gave you.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "active", "closed", "past_due"] as const).map((key) => {
              const count = (work.data?.assignments ?? []).filter((a) =>
                key === "all" ? true : assignmentStatus(a) === key,
              ).length;
              return (
                <Button
                  key={key}
                  size="sm"
                  variant={statusFilter === key ? "default" : "outline"}
                  onClick={() => setStatusFilter(key)}
                >
                  {key === "all" ? "All" : statusLabels[key]} ({count})
                </Button>
              );
            })}
          </div>
          {(work.data?.classes ?? []).map((klass) => {
            const items = (work.data?.assignments ?? [])
              .filter((a) => a.classId === klass.id)
              .filter((a) => (statusFilter === "all" ? true : assignmentStatus(a) === statusFilter))
              .sort((a, b) => {
                const at = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
                const bt = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
                return at - bt;
              });
            return (
              <section key={klass.id} className="paper p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
                  <h2 className="font-display text-2xl">{klass.name}</h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      {[klass.subject, klass.curriculum].filter(Boolean).join(" · ")} ·{" "}
                      {items.length} {items.length === 1 ? "assignment" : "assignments"}
                    </p>
                    <MessageTeacherDialog
                      classId={klass.id}
                      className={klass.name}
                      assignmentOptions={(work.data?.assignments ?? [])
                        .filter((a) => a.classId === klass.id)
                        .map((a) => ({ id: a.id, title: a.title }))}
                    />
                  </div>
                </div>

                <ClassBulletin
                  posts={(bulletins.data ?? []).filter((post) => post.class_id === klass.id)}
                />

                {items.length === 0 ? (
                  <p className="pt-4 text-sm text-muted-foreground">
                    No homework set for this class yet.
                  </p>
                ) : (
                  <div className="divide-y">
                    {items.map((assignment) => (
                      <Link
                        key={assignment.id}
                        to="/assignments/$assignmentId"
                        params={{ assignmentId: assignment.id }}
                        className="flex flex-wrap items-center justify-between gap-4 py-4 transition-colors hover:text-primary"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg">{assignment.title}</h3>
                            <Badge variant={statusBadgeVariant[assignmentStatus(assignment)]}>
                              {statusLabels[assignmentStatus(assignment)]}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {assignment.questionCount} questions · {assignment.totalMarks} marks
                            {assignment.dueAt ? ` · due ${formatDueDate(assignment.dueAt)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {assignment.awardedMarks !== null && assignment.status !== "not_started" ? (
                            <span className="font-display text-lg">
                              {assignment.awardedMarks}/{assignment.totalMarks}
                            </span>
                          ) : null}
                          <Badge variant={assignment.status === "submitted" ? "default" : "secondary"}>
                            {assignment.status === "submitted"
                              ? "Submitted"
                              : assignment.status === "in_progress"
                                ? "In progress"
                                : "Not started"}
                          </Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Read-only bulletin board: teacher posts for the whole class. */
function ClassBulletin({
  posts,
}: {
  posts: Array<{ id: string; title: string; body: string; created_at: string }>;
}) {
  if (posts.length === 0) return null;
  return (
    <div className="mt-4 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-medium">Class bulletin</p>
      {posts.map((post) => (
        <div key={post.id} className="rounded-md bg-card p-3">
          {post.title ? <p className="font-medium">{post.title}</p> : null}
          <p className="mt-1 whitespace-pre-wrap text-sm">{post.body}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDueDate(post.created_at)}
          </p>
        </div>
      ))}
    </div>
  );
}
