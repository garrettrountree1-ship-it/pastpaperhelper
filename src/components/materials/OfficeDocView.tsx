import { Download, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Renders .pptx slide decks and .docx documents inline so they simply scroll in
 * the pane, exactly like the PDF viewer. Slides are drawn one under the other;
 * Word files become flowing HTML.
 */
export function OfficeDocView({
  url,
  title,
  format,
}: {
  url: string;
  title: string;
  format: "pptx" | "docx";
}) {
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [html, setHtml] = useState<string>("");
  const slideHost = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setHtml("");

    (async () => {
      try {
        const buffer = await (await fetch(url)).arrayBuffer();
        console.log("OFFICEDOC_FETCH", format, buffer.byteLength);
        if (cancelled) return;

        if (format === "docx") {
          const mammoth = await import("mammoth/mammoth.browser.js");
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (cancelled) return;
          setHtml(result.value);
          setStatus("ready");
          return;
        }

        const host = slideHost.current;
        if (!host) return;
        host.innerHTML = "";
        const { init } = await import("pptx-preview");
        const width = Math.max(720, host.clientWidth || 900);
        const previewer = init(host, { width, height: Math.round((width * 9) / 16) });
        await previewer.preview(buffer);
        if (cancelled) return;
        setStatus("ready");
      } catch (e) {
        console.log("OFFICEDOC_ERR", String(e));
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, format]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 pb-1">
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          aria-label="Zoom out document"
          onClick={() => setZoom((v) => Math.max(0.5, Number((v - 0.1).toFixed(2))))}
        >
          <Minus className="size-3.5" />
        </Button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="min-w-11 rounded px-1 text-xs text-muted-foreground hover:bg-muted"
          aria-label="Reset document zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          aria-label="Zoom in document"
          onClick={() => setZoom((v) => Math.min(3, Number((v + 0.1).toFixed(2))))}
        >
          <Plus className="size-3.5" />
        </Button>
        <Button asChild size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs">
          <a href={url} download={title} target="_blank" rel="noreferrer">
            <Download className="size-3.5" />
            Download
          </a>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md bg-muted/30 p-2">
        {status === "loading" ? <Skeleton className="h-full w-full" /> : null}
        {status === "failed" ? (
          <p className="p-4 text-sm text-muted-foreground">
            This file couldn&apos;t be displayed inline. Use Download to open it, or upload a PDF
            version for in-app scrolling.
          </p>
        ) : null}

        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            width: `${100 / zoom}%`,
            display: status === "ready" || format === "pptx" ? "block" : "none",
          }}
        >
          {format === "pptx" ? (
            <div ref={slideHost} className="office-slides space-y-3" />
          ) : (
            <div
              className="office-doc rounded-md border bg-white p-6 text-sm leading-relaxed text-black shadow-sm"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
