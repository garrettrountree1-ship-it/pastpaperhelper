import { createFileRoute } from "@tanstack/react-router";

import { SectionShell, SectionTabsMobile } from "@/components/SectionShell";
import { MaterialsSection } from "@/components/materials/MaterialsSection";


export const Route = createFileRoute("/_authenticated/materials")({
  head: () => ({
    meta: [
      { title: "Class materials · STEM Homework AI" },
      { name: "description", content: "Unit slides, lecture videos and class resources." },
      { property: "og:title", content: "Class materials · STEM Homework AI" },
      { property: "og:description", content: "Unit slides, lecture videos and class resources." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MaterialsPage,
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

function MaterialsPage() {
  return (
    <SectionShell current="materials" title="Class materials">
      {(role) => (
        <>
          <SectionTabsMobile current="materials" />
          <div className="paper p-8">
            <h2 className="text-2xl">Units &amp; resources</h2>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              {role === "teacher"
                ? "Create a unit for each topic and upload slides, lecture videos and resources your students can view or download."
                : "Open any unit to view your teacher's slides, lecture videos and resources — view them in the app or download them."}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">Coming next in this build.</p>
          </div>
        </>
      )}
    </SectionShell>
  );
}
