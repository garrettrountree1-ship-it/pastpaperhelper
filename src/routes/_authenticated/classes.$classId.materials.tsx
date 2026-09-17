import { createFileRoute } from "@tanstack/react-router";

import { SectionShell, SectionTabsMobile } from "@/components/SectionShell";
import { MaterialsSection } from "@/components/materials/MaterialsSection";

export const Route = createFileRoute("/_authenticated/classes/$classId/materials")({
  validateSearch: (search: Record<string, unknown>): { mirrorUnit?: string | undefined } => {
    const mirrorUnit = search["mirrorUnit"];
    return { mirrorUnit: typeof mirrorUnit === "string" ? mirrorUnit : undefined };
  },
  head: () => ({
    meta: [
      { title: "Class materials · PastPaperHelper.AI" },
      { name: "description", content: "Unit slides, lecture videos and class resources." },
      { property: "og:title", content: "Class materials · PastPaperHelper.AI" },
      { property: "og:description", content: "Unit slides, lecture videos and class resources." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MaterialsPage,
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

function MaterialsPage() {
  const { classId } = Route.useParams();
  const { mirrorUnit } = Route.useSearch();
  return (
    <SectionShell classId={classId} current="materials" title="Class materials">
      {(role) => (
        <>
          <SectionTabsMobile classId={classId} current="materials" />
          <MaterialsSection classId={classId} role={role} mirrorUnitId={mirrorUnit} />
        </>
      )}
    </SectionShell>
  );
}
