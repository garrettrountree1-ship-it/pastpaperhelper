import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * The small window Google sends the teacher back to after they approve access.
 * It hands the one-time code back to the app and closes itself.
 */
export const Route = createFileRoute("/oauth/google-drive/return")({
  head: () => ({
    meta: [
      { title: "Finishing your Google connection · PastPaperHelper.AI" },
      {
        name: "description",
        content: "Completing the link between your teacher account and your own Google Drive.",
      },
      { property: "og:title", content: "Finishing your Google connection · PastPaperHelper.AI" },
      {
        property: "og:description",
        content: "Completing the link between your teacher account and your own Google Drive.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DriveReturn,
});

function DriveReturn() {
  const [message, setMessage] = useState("Finishing your Google connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: "google_drive", code: code ?? null },
        window.location.origin,
      );
      window.close();
    };

    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "Google did not finish the connection.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("Google finished without sending the connection back.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    notify("appUserConnectorOAuthComplete", code);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <h1 className="text-sm text-muted-foreground">{message}</h1>
    </main>
  );
}
