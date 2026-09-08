import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, HardDrive, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  completeMyDriveConnect,
  disconnectMyDrive,
  getMyDriveStatus,
  startMyDriveConnect,
} from "@/lib/google-drive.functions";

/** Waits for the small Google window to hand back its one-time code. */
function waitForConnection(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | null)?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        (event.data as { connectorId?: string } | null)?.connectorId !== "google_drive" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      ) {
        return;
      }
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        const code = (event.data as { code?: string | null }).code;
        resolve(typeof code === "string" ? code : null);
        return;
      }
      popup.close();
      reject(new Error("Google did not finish the connection."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The Google window closed before finishing."));
    }, 500);
  });
}

export function MyDrivePanel() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["my-drive-status"],
    queryFn: () => getMyDriveStatus(),
  });

  const connect = useMutation({
    mutationFn: async () => {
      const popup = window.open("", "pastpaperhelper-google", "width=600,height=720");
      if (!popup) throw new Error("Allow pop-up windows, then try again.");
      let code: string | null;
      try {
        const { authorizationUrl } = await startMyDriveConnect();
        const completion = waitForConnection(popup);
        popup.location.href = authorizationUrl;
        code = await completion;
      } catch (error) {
        popup.close();
        throw error;
      }
      if (code) await completeMyDriveConnect({ data: { code } });
    },
    onSuccess: () => {
      toast.success("Your Google Drive is connected.");
      void queryClient.invalidateQueries({ queryKey: ["my-drive-status"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectMyDrive(),
    onSuccess: () => {
      toast.success("Your Google Drive is no longer connected.");
      void queryClient.invalidateQueries({ queryKey: ["my-drive-status"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connected = status.data?.connected === true;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
      <HardDrive className="size-4 text-muted-foreground" />
      <div className="mr-auto text-sm">
        {connected ? (
          <span className="flex items-center gap-1.5">
            <Check className="size-4 text-success" />
            <span>
              Saving a copy of every resource to your Google Drive
              {status.data?.email ? ` (${status.data.email})` : ""} — folder
              &quot;PastPaperHelper.AI&quot;
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            Connect your own Google Drive to keep a copy of every resource you upload.
          </span>
        )}
      </div>
      {connected ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => disconnect.mutate()}
          disabled={disconnect.isPending}
        >
          {disconnect.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
          Disconnect
        </Button>
      ) : (
        <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
          {connect.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
          Connect Google Drive
        </Button>
      )}
    </div>
  );
}
