import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Settings, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { RedoAlerts } from "@/components/homework/RedoAlerts";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createClass,
  deleteClass,
  getMe,
  joinClass,
  setOAuthRole,
  updateClass,
} from "@/lib/app.functions";

import { listMaterialClasses } from "@/lib/materials.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDemoView } from "@/lib/demo-view";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · PastPaperHelper.AI" },
      {
        name: "description",
        content: "Jump into class materials, homework, timed quizzes or games.",
      },
      { property: "og:title", content: "Dashboard · PastPaperHelper.AI" },
      {
        property: "og:description",
        content: "Jump into class materials, homework, timed quizzes or games.",
      },
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
    mutationFn: async (role: "teacher" | "student") => setRole({ data: { role } }),
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
      const pendingRole = localStorage.getItem(PENDING_OAUTH_ROLE_KEY) as
        | "teacher"
        | "student"
        | null;
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
  const role = (isDemo ? view : me.data?.role) ?? "student";

  return (
    <div className="min-h-screen">
      <AppHeader name={me.data?.fullName || me.data?.email} role={role} />
      <RedoAlerts enabled={!me.isPending && role === "student"} />
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
        ) : (
          <>
            <h1 className="text-3xl">
              {me.data?.fullName ? `Welcome back, ${me.data.fullName.split(" ")[0]}` : "Welcome back"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a class first. Materials, homework, quizzes and games all live inside the class
              you choose.
            </p>

            <ClassPicker role={role} />
          </>

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
          You are currently in the <span className="font-medium text-foreground">{role} view</span>.
          Switch back and forth to see both sides of PastPaperHelper.AI. This dual view exists only in
          this demo account — real accounts are either a teacher or a student, never both.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant={role === "teacher" ? "default" : "outline"}
          onClick={() => switchRole("teacher")}
        >
          Teacher view
        </Button>
        <Button
          variant={role === "student" ? "default" : "outline"}
          onClick={() => switchRole("student")}
        >
          Student view
        </Button>
      </div>
    </div>
  );
}

function ClassPicker({ role }: { role: "teacher" | "student" }) {
  const queryClient = useQueryClient();
  const classes = useQuery({
    queryKey: ["my-classes"],
    queryFn: useServerFn(listMaterialClasses),
  });
  const create = useServerFn(createClass);
  const join = useServerFn(joinClass);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [curriculum, setCurriculum] = useState("IGCSE");
  const [code, setCode] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["my-classes"] });

  const createMutation = useMutation({
    mutationFn: () => create({ data: { name, subject, curriculum } }),
    onSuccess: () => {
      toast.success("Class created");
      setName("");
      setSubject("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const joinMutation = useMutation({
    mutationFn: () => join({ data: { code } }),
    onSuccess: (result) => {
      toast.success(`Joined ${result.name}`);
      setCode("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const list = role === "teacher" ? (classes.data ?? []).filter((c) => c.canManage) : (classes.data ?? []);

  return (
    <div className="mt-6 space-y-6">
      <div className="paper flex flex-wrap items-end gap-3 p-5">
        {role === "teacher" ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="class-name">New class *</Label>
              <Input
                id="class-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Add text here"
                className="w-56"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="class-subject">Subject (optional)</Label>
              <Input
                id="class-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Add text here"
                className="w-40"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="class-curriculum">Curriculum *</Label>
              <CurriculumSelect id="class-curriculum" value={curriculum} onChange={setCurriculum} />
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || !curriculum.trim() || createMutation.isPending}
            >
              Create class
            </Button>
          </>
        ) : (
          <>
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
            <Button
              onClick={() => joinMutation.mutate()}
              disabled={code.length < 4 || joinMutation.isPending}
            >
              Join class
            </Button>
          </>
        )}
      </div>

      {classes.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : list.length === 0 ? (
        <div className="paper p-8 text-center text-muted-foreground">
          {role === "teacher"
            ? "Create your first class above to start setting homework."
            : "No classes yet. Join your class with the code your teacher gave you."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((klass) => (
            <div key={klass.id} className="paper group p-6 transition-shadow hover:shadow-lift">
              <Link
                to="/classes/$classId"
                params={{ classId: klass.id }}
                className="flex items-start gap-4"
              >
                <span className="rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <BookOpen className="size-7" />
                </span>
                <span>
                  <span className="block font-display text-2xl">{klass.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {[klass.subject, klass.curriculum].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-2 block text-sm text-muted-foreground">
                    Materials · Homework · Quizzes · Games
                  </span>
                </span>
              </Link>
              {role === "teacher" && klass.canManage ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Class code
                    </span>
                    <code className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-sm tracking-widest">
                      {klass.joinCode ?? "—"}
                    </code>
                    {klass.joinCode ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard
                            ?.writeText(klass.joinCode!)
                            .then(() => toast.success("Class code copied — send it to your students"))
                            .catch(() => toast.error("Could not copy. Select the code manually."));
                        }}
                      >
                        Copy
                      </Button>
                    ) : null}
                  </div>
                  <ManageClassDialog klass={klass} onChanged={refresh} />
                </div>
              ) : null}

            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManageClassDialog({
  klass,
  onChanged,
}: {
  klass: { id: string; name: string; subject: string | null; curriculum: string | null };
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(klass.name);
  const [subject, setSubject] = useState(klass.subject ?? "");
  const [curriculum, setCurriculum] = useState(klass.curriculum ?? "");
  const [confirm, setConfirm] = useState("");
  const queryClient = useQueryClient();
  const save = useServerFn(updateClass);
  const remove = useServerFn(deleteClass);

  useEffect(() => {
    if (!open) return;
    setName(klass.name);
    setSubject(klass.subject ?? "");
    setCurriculum(klass.curriculum ?? "");
    setConfirm("");
  }, [open, klass.name, klass.subject, klass.curriculum]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["my-classes"] });
    queryClient.invalidateQueries({ queryKey: ["teacher-classes"] });
    queryClient.invalidateQueries({ queryKey: ["class-overview", klass.id] });
    onChanged();
  };

  const renameMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          classId: klass.id,
          name: name.trim(),
          curriculum: curriculum.trim() || "IGCSE",
          subject: subject.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Class updated");
      invalidate();
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => remove({ data: { classId: klass.id } }),
    onSuccess: () => {
      toast.success("Class deleted");
      invalidate();
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="size-4" />
          Rename or delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage {klass.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`rename-${klass.id}`}>Class name</Label>
            <Input
              id={`rename-${klass.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`subject-${klass.id}`}>Subject</Label>
              <Input
                id={`subject-${klass.id}`}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`curriculum-${klass.id}`}>Curriculum</Label>
              <Input
                id={`curriculum-${klass.id}`}
                value={curriculum}
                onChange={(event) => setCurriculum(event.target.value)}
              />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() => renameMutation.mutate()}
            disabled={!name.trim() || renameMutation.isPending}
          >
            Save changes
          </Button>

          <div className="rounded-xl border border-destructive/40 p-4">
            <p className="font-medium text-destructive">Delete this class</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This permanently removes the roster, homework, quizzes, games and materials for this
              class. Type <span className="font-mono">DELETE</span> to confirm.
            </p>
            <Input
              className="mt-3"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value.toUpperCase())}
              placeholder="DELETE"
            />
            <Button
              variant="destructive"
              className="mt-3 w-full"
              disabled={confirm !== "DELETE" || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              <Trash2 className="size-4" />
              Delete class permanently
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

