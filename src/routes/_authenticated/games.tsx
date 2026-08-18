import { createFileRoute } from "@tanstack/react-router";

import { SectionShell, SectionTabsMobile } from "@/components/SectionShell";

export const Route = createFileRoute("/_authenticated/games")({
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
  return (
    <SectionShell current="games" title="Games">
      {(role) => (
        <>
          <SectionTabsMobile current="games" />
          <div className="paper p-8">
            <h2 className="text-2xl">Challenges &amp; leaderboard</h2>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              {role === "teacher"
                ? "Pair students for head-to-head past-paper challenges, watch the token leaderboard, and reset or adjust tokens for class rewards."
                : "Face a classmate on a past-paper question, catch the daily double, and climb the leaderboard under your secret animal name."}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">Coming next in this build.</p>
          </div>
        </>
      )}
    </SectionShell>
  );
}
