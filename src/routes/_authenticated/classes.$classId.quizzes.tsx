import { createFileRoute } from "@tanstack/react-router";

import { QuizzesSection } from "@/components/quizzes/QuizzesSection";
import { SectionShell, SectionTabsMobile } from "@/components/SectionShell";

export const Route = createFileRoute("/_authenticated/classes/$classId/quizzes")({
  head: () => ({
    meta: [
      { title: "Quizzes · PastPaperHelper.AI" },
      { name: "description", content: "Timed in-class quizzes built from past papers." },
      { property: "og:title", content: "Quizzes · PastPaperHelper.AI" },
      { property: "og:description", content: "Timed in-class quizzes built from past papers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuizzesPage,
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

function QuizzesPage() {
  const { classId } = Route.useParams();
  return (
    <SectionShell classId={classId} current="quizzes" title="Quizzes">
      {(role) => (
        <>
          <SectionTabsMobile classId={classId} current="quizzes" />
          <QuizzesSection classId={classId} role={role} />
        </>
      )}
    </SectionShell>
  );
}
