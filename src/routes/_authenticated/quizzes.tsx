import { createFileRoute } from "@tanstack/react-router";

import { SectionShell, SectionTabsMobile } from "@/components/SectionShell";

export const Route = createFileRoute("/_authenticated/quizzes")({
  head: () => ({
    meta: [
      { title: "Quizzes · STEM Homework AI" },
      { name: "description", content: "Timed in-class quizzes built from past papers." },
      { property: "og:title", content: "Quizzes · STEM Homework AI" },
      { property: "og:description", content: "Timed in-class quizzes built from past papers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuizzesPage,
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

function QuizzesPage() {
  return (
    <SectionShell current="quizzes" title="Quizzes">
      {(role) => (
        <>
          <SectionTabsMobile current="quizzes" />
          <div className="paper p-8">
            <h2 className="text-2xl">Timed quizzes</h2>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              {role === "teacher"
                ? "Upload a past paper and mark scheme, set a time limit, then release the quiz when the class is ready. Marking runs only when the timer ends."
                : "Your teacher will release timed quizzes here during class. Nothing is marked until the timer runs out."}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">Coming next in this build.</p>
          </div>
        </>
      )}
    </SectionShell>
  );
}
