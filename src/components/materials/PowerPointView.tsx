import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  DocMarkupToolbar,
  MARKUP_WIDTH,
  useDocMarkup,
} from "@/components/materials/DocMarkupLayer";
import { HighlightLayer, SlideAnnotations } from "@/components/materials/SlideAnnotations";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Displays the untouched uploaded presentation through Microsoft's PowerPoint
 * renderer. Unlike the former XML-to-HTML reconstruction, this preserves the
 * deck's real fonts, text flow, image crops, groups, charts, and master layout.
 *
 * A drawing / text-box layer sits on top of the viewer. While the "Select" tool
 * is chosen the layer is click-through, so the presentation stays fully usable.
 */
export function PowerPointView({
  url,
  title,
  canDownload = true,
  markupKey,
  canAnnotate = true,
}: {
  url: string;
  title: string;
  canDownload?: boolean;
  /** Stable key so marks made on this deck are still there next lesson. */
  markupKey?: string;
  /** Only teachers draw or add text boxes; students get a clean viewer. */
  canAnnotate?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [viewerVersion, setViewerVersion] = useState(0);
  const viewerUrl = useMemo(
    () => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`,
    [url],
  );

  const markup = useDocMarkup(`pptx-original-annotations:${markupKey ?? title}`);
  const effTool = canAnnotate ? markup.tool : "none";
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setBox({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = box.width > 0 ? box.width / MARKUP_WIDTH : 1;
  const markupHeight = Math.max(1, Math.round((box.height || 600) / scale));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <span className="truncate text-xs text-muted-foreground">Original PowerPoint view</span>
        <div className="ml-auto flex items-center gap-2">
          <DocMarkupToolbar
            tool={markup.tool}
            setTool={markup.setTool}
            penColor={markup.penColor}
            setPenColor={markup.setPenColor}
            highlightColor={markup.highlightColor}
            setHighlightColor={markup.setHighlightColor}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
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
      </div>

      <div
        ref={hostRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/30"
      >
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
        <HighlightLayer
          width={MARKUP_WIDTH}
          height={markupHeight}
          strokes={markup.annotationOf(0).strokes}
        />
        <div
          className="absolute left-0 top-0 z-20"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: markup.tool === "none" ? "none" : "auto",
          }}
        >
          <SlideAnnotations
            width={MARKUP_WIDTH}
            height={markupHeight}
            tool={markup.tool}
            color={markup.penColor}
            highlightColor={markup.highlightColor}
            value={markup.annotationOf(0)}
            onChange={(next) => markup.update(0, next)}
            hideHighlights
          />
        </div>

      </div>
    </div>
  );
}
