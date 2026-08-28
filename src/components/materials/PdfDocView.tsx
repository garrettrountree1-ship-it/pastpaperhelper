import { Download, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
}: {
  url: string;
  title: string;
  cacheKey?: string;
}) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const token = useRef(0);
  const key = cacheKey ?? title;

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
      <div className="flex items-center gap-2 pb-1">
        <span className="truncate text-xs text-muted-foreground">
          Saved on this device — opens without reloading.
        </span>
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
        <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
          <a href={url} download={`${title}.pdf`} target="_blank" rel="noreferrer">
            <Download className="size-3.5" />
            Download
          </a>
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md bg-muted/30 p-2">
        {pages.map((src, index) => (
          <img
            key={index}
            src={src}
            alt={`${title} page ${index + 1}`}
            className="w-full rounded-md border bg-white shadow-sm"
          />
        ))}
      </div>
    </div>
  );
}
