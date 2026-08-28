import { Download, Minus, Plus, RefreshCw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clearCachedDoc, readCachedDoc, writeCachedDoc } from "@/lib/doc-cache";

/**
 * Renders every page of a PDF as an image so the document simply scrolls in the
 * pane — no dark browser PDF chrome, no thumbnail sidebar. Rendered pages are
 * cached in the browser (IndexedDB) under `cacheKey`, so the document is only
 * ever built once instead of reloading every time the workspace opens.
 */
export function PdfDocView({
  url,
  title,
  cacheKey,
  canDownload = true,
}: {
  url: string;
  title: string;
  cacheKey?: string;
  canDownload?: boolean;
}) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [zoom, setZoom] = useState(1);
  const token = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const key = cacheKey ?? title;

  // Zooming keeps the anchor point fixed instead of shifting the scroll.
  const pendingScroll = useRef<{ x: number; y: number } | null>(null);

  function applyZoom(
    nextOf: (current: number) => number,
    anchor?: { x: number; y: number },
  ) {
    setZoom((current) => {
      const next = Math.min(3, Math.max(0.5, Number(nextOf(current).toFixed(3))));
      const el = scrollRef.current;
      if (el && next !== current) {
        const ax = anchor?.x ?? el.clientWidth / 2;
        const ay = anchor?.y ?? el.clientHeight / 2;
        const k = next / current;
        pendingScroll.current = {
          x: (el.scrollLeft + ax) * k - ax,
          y: (el.scrollTop + ay) * k - ay,
        };
      }
      return next;
    });
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const target = pendingScroll.current;
    pendingScroll.current = null;
    if (!el || !target) return;
    el.scrollLeft = Math.max(0, target.x);
    el.scrollTop = Math.max(0, target.y);
  }, [zoom]);

  // Ctrl/⌘ + wheel zooms only the document pane.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const rect = el.getBoundingClientRect();
      applyZoom((value) => value * Math.exp(-dy * 0.0015), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);



  useEffect(() => {
    const current = ++token.current;
    setPages(null);
    setFailed(false);

    (async () => {
      const cached = await readCachedDoc(key);
      if (token.current !== current) return;
      if (cached) {
        setPages(cached);
        return;
      }

      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const buffer = await (await fetch(url)).arrayBuffer();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
        const out: string[] = [];
        for (let index = 1; index <= Math.min(doc.numPages, 60); index += 1) {
          const page = await doc.getPage(index);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2.2, 1400 / base.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const context = canvas.getContext("2d")!;
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport } as never).promise;
          out.push(canvas.toDataURL("image/jpeg", 0.85));
          if (token.current !== current) return;
        }
        if (token.current === current) {
          setPages(out);
          void writeCachedDoc(key, out);
        }
      } catch {
        if (token.current === current) setFailed(true);
      } finally {
        if (token.current === current) setRebuilding(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, url, rebuilding]);

  if (failed) {
    return <iframe src={url} title={title} className="h-full w-full rounded-md bg-white" />;
  }

  if (!pages) return <Skeleton className="h-full w-full" />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 pb-1">
        <Button
          size="icon"
          variant="outline"
          className="size-7"
          aria-label="Zoom out document"
          onClick={() => applyZoom((value) => value - 0.1)}
        >
          <Minus className="size-3.5" />
        </Button>
        <button
          type="button"
          onClick={() => applyZoom(() => 1)}
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
          onClick={() => applyZoom((value) => value + 0.1)}
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2 text-xs"
          onClick={async () => {
            await clearCachedDoc(key);
            setRebuilding((value) => !value);
          }}
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
        {canDownload === false ? null : (
        <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
          <a href={url} download={`${title}.pdf`} target="_blank" rel="noreferrer">
            <Download className="size-3.5" />
            Download
          </a>
        </Button>
        )}
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-auto rounded-md bg-muted/30 p-2"
      >
        {pages.map((src, index) => (
          <img
            key={index}
            src={src}
            alt={`${title} page ${index + 1}`}
            className="rounded-md border bg-white shadow-sm"
            style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
          />
        ))}
      </div>

    </div>
  );
}
