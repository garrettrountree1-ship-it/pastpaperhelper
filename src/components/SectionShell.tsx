import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Gamepad2, LayoutGrid, NotebookPen, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSectionTime } from "@/hooks/use-section-time";
import { getMe } from "@/lib/app.functions";
import { useDemoView } from "@/lib/demo-view";
import { SECTIONS, type SectionKey } from "@/lib/sections";

const icons: Record<SectionKey, typeof BookOpen> = {
  materials: BookOpen,
  homework: NotebookPen,
  quizzes: Timer,
  games: Gamepad2,
};

/**
 * Shared chrome for the four app sections: header, left ribbon for fast
 * switching, and role-aware content.
 */
export function SectionShell({
  current,
  title,
  children,
}: {
  current: SectionKey;
  title: string;
  children: (role: "teacher" | "student") => ReactNode;
}) {
  const me = useQuery({ queryKey: ["me"], queryFn: useServerFn(getMe), retry: 2 });
  const isDemo = Boolean(me.data?.isDemo);
  const { view, setDemoView } = useDemoView(isDemo, me.data?.role ?? "student");
  const role = (isDemo ? view : me.data?.role) ?? "student";
  const queryClient = useQueryClient();
  useSectionTime(current);

  return (
    <div className="min-h-screen">
      <AppHeader name={me.data?.fullName || me.data?.email} role={role} />
      <div className="mx-auto flex max-w-6xl gap-4 px-4 py-6">
        <SectionRibbon current={current} role={role} />
        <main className="min-w-0 flex-1">
          {isDemo ? (
            <div className="paper mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-muted-foreground">
                Demo account — currently in the{" "}
                <span className="font-medium text-foreground">{role} view</span>. Real accounts are
                either a teacher or a student, never both.
              </p>
              <div className="flex gap-2">
                {(["teacher", "student"] as const).map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    variant={role === next ? "default" : "outline"}
                    onClick={() => {
                      setDemoView(next);
                      queryClient.invalidateQueries();
                      toast.success(next === "teacher" ? "Teacher view" : "Student view");
                    }}
                  >
                    {next === "teacher" ? "Teacher view" : "Student view"}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <h1 className="sr-only">{title}</h1>
          {me.isPending ? <Skeleton className="h-40 w-full" /> : children(role)}
        </main>
      </div>
    </div>
  );
}

function SectionRibbon({ current, role }: { current: SectionKey; role: "teacher" | "student" }) {
  return (
    <nav
      aria-label="App sections"
      className="paper sticky top-20 hidden h-fit w-14 shrink-0 flex-col items-center gap-1 p-2 md:flex lg:w-48 lg:items-stretch"
    >
      <Link
        to="/dashboard"
        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted lg:px-3"
        title="All sections"
      >
        <LayoutGrid className="size-5 shrink-0" />
        <span className="hidden lg:inline">All sections</span>
      </Link>
      <div className="my-1 h-px w-full bg-border" />
      {SECTIONS.map((section) => {
        const Icon = icons[section.key];
        const active = section.key === current;
        return (
          <Link
            key={section.key}
            to={section.to}
            title={section.label}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors lg:px-3 ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-5 shrink-0" />
            <span className="hidden lg:inline">{section.label}</span>
          </Link>
        );
      })}
      <p className="mt-2 hidden px-3 text-xs text-muted-foreground lg:block">
        {role === "teacher" ? "Teacher tools" : "Student view"}
      </p>
    </nav>
  );
}

/** Mobile section switcher — rendered by section routes below the header. */
export function SectionTabsMobile({ current }: { current: SectionKey }) {
  return (
    <nav aria-label="App sections" className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
      {SECTIONS.map((section) => {
        const Icon = icons[section.key];
        const active = section.key === current;
        return (
          <Link
            key={section.key}
            to={section.to}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
              active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
            }`}
          >
            <Icon className="size-4" />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
