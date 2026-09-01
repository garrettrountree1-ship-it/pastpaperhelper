import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Gamepad2, NotebookPen, Timer, Users } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { useMyClasses } from "@/components/SectionShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listClassRoster } from "@/lib/materials.functions";
import { SECTIONS, type SectionKey } from "@/lib/sections";

export const Route = createFileRoute("/_authenticated/classes/$classId/")({
  head: () => ({
    meta: [
      { title: "Class home · PastPaperHelper.AI" },
      {
        name: "description",
        content: "Class materials, homework, timed quizzes and games for this class.",
      },
      { property: "og:title", content: "Class home · PastPaperHelper.AI" },
      {
        property: "og:description",
        content: "Class materials, homework, timed quizzes and games for this class.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClassHome,
  notFoundComponent: () => <div className="p-8 text-center">Class not found.</div>,
});

const icons: Record<SectionKey, typeof BookOpen> = {
  materials: BookOpen,
  homework: NotebookPen,
  quizzes: Timer,
  games: Gamepad2,
};

function ClassHome() {
  const { classId } = Route.useParams();
  const classes = useMyClasses();
  const klass = (classes.data ?? []).find((c) => c.id === classId) ?? null;
  const role = klass?.canManage ? "teacher" : "student";

  return (
    <div className="min-h-screen">
      <AppHeader role={role} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← All classes
        </Link>
        {classes.isPending ? (
          <Skeleton className="mt-6 h-48 w-full" />
        ) : !klass ? (
          <div className="paper mt-6 p-8 text-center">
            <p className="mb-4 text-muted-foreground">
              We couldn&apos;t find this class for your account.
            </p>
            <Button asChild>
              <Link to="/dashboard">Back to your classes</Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="mt-2 text-3xl">{klass.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[klass.subject, klass.curriculum].filter(Boolean).join(" · ")} — everything below
              belongs to this class only.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {SECTIONS.map((section) => {
                const Icon = icons[section.key];
                return (
                  <Link
                    key={section.key}
                    to={section.to}
                    params={{ classId }}
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

            {role === "teacher" ? <ClassRoster classId={classId} /> : null}
          </>
        )}
      </main>
    </div>
  );
}

/** Teacher-only list of the students who have joined this class. */
function ClassRoster({ classId }: { classId: string }) {
  const fetchRoster = useServerFn(listClassRoster);
  const roster = useQuery({
    queryKey: ["class-roster", classId],
    queryFn: () => fetchRoster({ data: { classId } }),
  });
  const students = roster.data ?? [];

  return (
    <section className="paper mt-6 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Users className="size-5 text-primary" />
        <h2 className="font-display text-xl">Students in this class</h2>
        <span className="text-sm text-muted-foreground">
          {roster.isPending ? "" : `· ${students.length}`}
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Visible to you only — students cannot see this list.
      </p>
      {roster.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : students.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No students yet. Share the class code so they can join.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2 pr-4">{s.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{s.email ?? "—"}</td>
                  <td className="py-2 text-muted-foreground">
                    {new Date(s.joinedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
