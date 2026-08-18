import { createFileRoute } from "@tanstack/react-router";

import { SectionShell, SectionTabsMobile } from "@/components/SectionShell";
import { HomeworkSection } from "@/components/homework/HomeworkSection";

export const Route = createFileRoute("/_authenticated/homework")({
  head: () => ({
    meta: [
      { title: "Homework · STEM Homework AI" },
      { name: "description", content: "Past-paper homework with AI marking and a Socratic tutor." },
      { property: "og:title", content: "Homework · STEM Homework AI" },
      {
        property: "og:description",
        content: "Past-paper homework with AI marking and a Socratic tutor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomeworkPage,
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

function HomeworkPage() {
  return (
    <SectionShell current="homework" title="Homework">
      {(role) => (
        <>
          <SectionTabsMobile current="homework" />
          <HomeworkSection role={role} />
        </>
      )}
    </SectionShell>
  );
}
