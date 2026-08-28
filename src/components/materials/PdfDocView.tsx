import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Renders every page of a PDF as an image so the document simply scrolls in the
 * pane — no dark browser PDF chrome, no thumbnail sidebar.
 */
export function PdfDocView({ url, title }: { url: string; title: string }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const token = useRef(0);

  useEffect(() => {
    const current = ++token.current;
    setPages(null);
    setFailed(false);

    (async () => {
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
        if (token.current === current) setPages(out);
      } catch {
        if (token.current === current) setFailed(true);
      }
    })();
  }, [url]);

  if (failed) {
    return (
      <iframe src={url} title={title} className="h-full w-full rounded-md bg-white" />
    );
  }

  if (!pages) return <Skeleton className="h-full w-full" />;

  return (
    <div className="h-full space-y-3 overflow-y-auto bg-muted/30 p-2">
      {pages.map((src, index) => (
        <img
          key={index}
          src={src}
          alt={`${title} page ${index + 1}`}
          className="w-full rounded-md border bg-white shadow-sm"
        />
      ))}
    </div>
  );
}
