import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeftRight,
  BookOpen,
  Check,
  ChevronDown,
  Gamepad2,
  LayoutGrid,
  NotebookPen,
  Timer,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

import { useSectionTime } from "@/hooks/use-section-time";
import { getMe } from "@/lib/app.functions";
import { useDemoView } from "@/lib/demo-view";
import { listMaterialClasses } from "@/lib/materials.functions";
import { SECTIONS, type SectionKey } from "@/lib/sections";

const icons: Record<SectionKey, typeof BookOpen> = {
  materials: BookOpen,
  homework: NotebookPen,
  quizzes: Timer,
  games: Gamepad2,
};

/** Classes the signed-in user can open, teacher or student. */
export function useMyClasses() {
  return useQuery({ queryKey: ["my-classes"], queryFn: useServerFn(listMaterialClasses) });
}

/**
 * Shared chrome for the four sections inside one class: header, left ribbon for
 * fast switching between that class's sections, and role-aware content.
 */
export function SectionShell({
  classId,
  current,
  title,
  children,
}: {
  classId: string;
  current: SectionKey;
  title: string;
  children: (role: "teacher" | "student") => ReactNode;
}) {
  const me = useQuery({ queryKey: ["me"], queryFn: useServerFn(getMe), retry: 2 });
  const isDemo = Boolean(me.data?.isDemo);
  const { view, setDemoView } = useDemoView(isDemo, me.data?.role ?? "student");
  const classes = useMyClasses();
  const klass = (classes.data ?? []).find((c) => c.id === classId) ?? null;
  const accountRole = (isDemo ? view : me.data?.role) ?? "student";
  // Inside a class the role is what you actually are in that class — except on
  // the demo account, where the chosen view always wins.
  const role: "teacher" | "student" = isDemo
    ? accountRole
    : klass
      ? klass.canManage
        ? "teacher"
        : "student"
      : accountRole;

  const queryClient = useQueryClient();
  useSectionTime(current);

  return (
    <div className="min-h-screen">
      <AppHeader name={me.data?.fullName || me.data?.email} role={role} />
      <div className="mx-auto flex max-w-6xl gap-4 px-4 py-6">
        <SectionRibbon classId={classId} current={current} role={role} />
        <main className="min-w-0 flex-1">
          {isDemo ? (
            <div className="paper mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-muted-foreground">
                Demo account — currently in the{" "}
                <span className="font-medium text-foreground">{accountRole} view</span>. Real
                accounts are either a teacher or a student, never both.
              </p>
              <div className="flex gap-2">
                {(["teacher", "student"] as const).map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    variant={accountRole === next ? "default" : "outline"}
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
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">
                ← All classes
              </Link>
              <h1 className="font-display text-2xl">
                {klass ? klass.name : "Class"}{" "}
                <span className="text-muted-foreground">· {title}</span>
              </h1>
            </div>
            {klass ? (
              <p className="text-sm text-muted-foreground">
                {[klass.subject, klass.curriculum].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
          {me.isPending || classes.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            children(role)
          )}
        </main>
      </div>
    </div>
  );
}

function SectionRibbon({
  classId,
  current,
  role,
}: {
  classId: string;
  current: SectionKey;
  role: "teacher" | "student";
}) {
  const classes = useMyClasses();
  const list = classes.data ?? [];
  const active = list.find((c) => c.id === classId) ?? null;

  return (
    <nav
      aria-label="Class sections"
      className="paper sticky top-20 hidden h-fit w-14 shrink-0 flex-col items-center gap-1 p-2 md:flex lg:w-48 lg:items-stretch"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Switch class"
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted lg:px-3"
          >
            <ArrowLeftRight className="size-5 shrink-0" />
            <span className="hidden min-w-0 flex-1 truncate text-left lg:inline">
              {active ? active.name : "Switch class"}
            </span>
            <ChevronDown className="hidden size-4 shrink-0 text-muted-foreground lg:inline" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Your classes</DropdownMenuLabel>
          {list.length === 0 ? (
            <DropdownMenuItem disabled>No classes yet</DropdownMenuItem>
          ) : (
            list.map((klass) => (
              <DropdownMenuItem key={klass.id} asChild>
                <Link
                  to={SECTIONS.find((s) => s.key === current)!.to}
                  params={{ classId: klass.id }}
                  className="flex w-full items-center justify-between gap-2"
                >
                  <span className="truncate">{klass.name}</span>
                  {klass.id === classId ? <Check className="size-4 shrink-0" /> : null}
                </Link>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/dashboard">All classes</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="my-1 h-px w-full bg-border" />
      <Link
        to="/classes/$classId"
        params={{ classId }}
        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted lg:px-3"
        title="Class home"
      >
        <LayoutGrid className="size-5 shrink-0" />
        <span className="hidden lg:inline">Class home</span>
      </Link>
      <div className="my-1 h-px w-full bg-border" />

      {SECTIONS.map((section) => {
        const Icon = icons[section.key];
        const active = section.key === current;
        return (
          <Link
            key={section.key}
            to={section.to}
            params={{ classId }}
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
export function SectionTabsMobile({
  classId,
  current,
}: {
  classId: string;
  current: SectionKey;
}) {
  return (
    <nav aria-label="Class sections" className="mb-4 flex gap-2 overflow-x-auto pb-1 md:hidden">
      {SECTIONS.map((section) => {
        const Icon = icons[section.key];
        const active = section.key === current;
        return (
          <Link
            key={section.key}
            to={section.to}
            params={{ classId }}
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
