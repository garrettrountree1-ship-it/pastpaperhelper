import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The former signed-in presentation page now forwards everyone to the single
 * public Class Mirror entrance. Keeping the old URL as a redirect means saved
 * bookmarks still work without maintaining a second mirror implementation.
 */
export const Route = createFileRoute("/_authenticated/present/$code")({
  beforeLoad: () => {
    throw redirect({ to: "/mirror" });
  },
  component: () => null,
});
