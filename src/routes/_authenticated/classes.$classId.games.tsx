import { createFileRoute } from "@tanstack/react-router";

import { GamesSection } from "@/components/games/GamesSection";
import { SectionShell, SectionTabsMobile } from "@/components/SectionShell";

export const Route = createFileRoute("/_authenticated/classes/$classId/games")({
  head: () => ({
    meta: [
      { title: "Games · STEM Homework AI" },
      { name: "description", content: "Past-paper challenges, the daily double and token leaderboard." },
      { property: "og:title", content: "Games · STEM Homework AI" },
      {
        property: "og:description",
        content: "Past-paper challenges, the daily double and token leaderboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GamesPage,
  notFoundComponent: () => <div className="p-8 text-center">Page not found.</div>,
});

function GamesPage() {
  const { classId } = Route.useParams();
  return (
    <SectionShell classId={classId} current="games" title="Games">
      {(role) => (
        <>
          <SectionTabsMobile classId={classId} current="games" />
          <GamesSection classId={classId} role={role} />
        </>
      )}
    </SectionShell>
  );
}
