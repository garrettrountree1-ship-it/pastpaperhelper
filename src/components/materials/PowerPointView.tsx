import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Displays the untouched uploaded presentation through Microsoft's PowerPoint
 * renderer. Unlike the former XML-to-HTML reconstruction, this preserves the
 * deck's real fonts, text flow, image crops, groups, charts, and master layout.
 */
export function PowerPointView({
  url,
  title,
  canDownload = true,
}: {
  url: string;
  title: string;
  canDownload?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [viewerVersion, setViewerVersion] = useState(0);
  const viewerUrl = useMemo(
    () => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`,
    [url],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 pb-1">
        <span className="truncate text-xs text-muted-foreground">Original PowerPoint view</span>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto size-7"
          aria-label="Reload presentation"
          title="Reload presentation"
          onClick={() => {
            setLoaded(false);
            setViewerVersion((current) => current + 1);
          }}
        >
          <RefreshCw className="size-3.5" />
        </Button>
        <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
          <a href={viewerUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" />
            Full screen
          </a>
        </Button>
        {canDownload ? (
          <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
            <a href={url} download={title} target="_blank" rel="noreferrer">
              <Download className="size-3.5" />
              Download
            </a>
          </Button>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/30">
        {!loaded ? (
          <div className="absolute inset-0 z-10 space-y-3 bg-background p-4">
            <p className="text-sm text-muted-foreground">Opening the original presentation…</p>
            <Skeleton className="h-[calc(100%-2rem)] w-full" />
          </div>
        ) : null}
        <iframe
          key={viewerVersion}
          src={viewerUrl}
          title={title}
          className="h-full min-h-[420px] w-full border-0 bg-background"
          allow="fullscreen"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}
