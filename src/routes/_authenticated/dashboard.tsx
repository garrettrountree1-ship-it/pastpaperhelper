import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Gamepad2, NotebookPen, Timer } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMe, setOAuthRole } from "@/lib/app.functions";
import { useDemoView } from "@/lib/demo-view";
import { SECTIONS, type SectionKey } from "@/lib/sections";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · STEM Homework AI" },
      {
        name: "description",
        content: "Jump into class materials, homework, timed quizzes or games.",
      },
      { property: "og:title", content: "Dashboard · STEM Homework AI" },
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

const icons: Record<SectionKey, typeof BookOpen> = {
  materials: BookOpen,
  homework: NotebookPen,
  quizzes: Timer,
  games: Gamepad2,
};

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
              Pick a section to get started. Once you&apos;re inside, the sections stay on a ribbon
              down the left so you can switch fast.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {SECTIONS.map((section) => {
                const Icon = icons[section.key];
                return (
                  <Link
                    key={section.key}
                    to={section.to}
                    className="paper group flex items-start gap-4 p-6 transition-shadow hover:shadow-lift"
                  >
                    <span className="rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-7" />
                    </span>
                    <span>
                      <span className="block font-display text-2xl">{section.label}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {role === "teacher" ? section.teacherBlurb : section.blurb}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
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
          Switch back and forth to see both sides of STEM Homework AI. This dual view exists only in
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
