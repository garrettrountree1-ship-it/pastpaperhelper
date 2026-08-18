import { createFileRoute } from "@tanstack/react-router";

import { SectionShell, SectionTabsMobile } from "@/components/SectionShell";
import { MaterialsSection } from "@/components/materials/MaterialsSection";


export const Route = createFileRoute("/_authenticated/classes/$classId/materials")({
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
          <MaterialsSection role={role} />

        </>
      )}
    </SectionShell>
  );
}
