import { Download, Minus, Plus, RefreshCw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  DocMarkupSurface,
  DocMarkupToolbar,
  useDocMarkup,
} from "@/components/materials/DocMarkupLayer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  clearCachedDoc,
  readCachedDoc,
  readCachedJson,
  writeCachedDoc,
  writeCachedJson,
} from "@/lib/doc-cache";
import { useMirrorField, useMirrorScroll } from "@/lib/lesson-mirror";

/** One selectable word/run from the PDF, in rendered page pixels. */
type TextRun = { x: number; y: number; w: number; h: number; s: string };
type PageText = { w: number; h: number; runs: TextRun[] };

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
  canAnnotate = true,
}: {
  url: string;
  title: string;
  cacheKey?: string;
  canDownload?: boolean;
  /** Only teachers draw or highlight; students get a clean viewer. */
  canAnnotate?: boolean;
}) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [zoom, setZoom] = useState(1);
  const token = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const key = cacheKey ?? title;
  const markup = useDocMarkup(`pdf-annotations:${key}`);
  // Students never get the markup tools — their viewer stays in select mode.
  const effTool = canAnnotate ? markup.tool : "none";
  useMirrorField(`pdf.zoom:${key}`, zoom, setZoom);
  useMirrorScroll(`pdf.scroll:${key}`, scrollRef);
  const [ratios, setRatios] = useState<Record<number, number>>({});
  // Invisible, selectable text sitting exactly over each page image, so the
  // document can be highlighted and copied like a normal PDF.
  const [texts, setTexts] = useState<PageText[] | null>(null);
  const textKey = `pdf-text-v1:${key}`;

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
  // A refreshed download address must not reload the document and throw the
  // reader back to page one.
  const urlRef = useRef(url);
  urlRef.current = url;

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
      const cachedText = await readCachedJson<PageText[]>(textKey);
      if (token.current !== current) return;
      if (cached && cachedText) {
        setPages(cached);
        setTexts(cachedText);
        return;
      }

      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const buffer = await (await fetch(urlRef.current)).arrayBuffer();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
        const out: string[] = [];
        const textOut: PageText[] = [];
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

          try {
            const content = await page.getTextContent();
            const runs: TextRun[] = [];
            for (const raw of content.items as Array<{
              str?: string;
              transform?: number[];
              width?: number;
              height?: number;
            }>) {
              const str = raw?.str ?? "";
              if (!str.trim() || !raw.transform) continue;
              const size = Math.hypot(raw.transform[1] ?? 0, raw.transform[3] ?? 1) * scale;
              const height = Math.max(raw.height ? raw.height * scale : size, 1);
              runs.push({
                x: (raw.transform[4] ?? 0) * scale,
                y: canvas.height - (raw.transform[5] ?? 0) * scale - height,
                w: Math.max((raw.width ?? 0) * scale, 1),
                h: height,
                s: str,
              });
            }
            textOut.push({ w: canvas.width, h: canvas.height, runs });
          } catch {
            textOut.push({ w: canvas.width, h: canvas.height, runs: [] });
          }
          if (token.current !== current) return;
        }
        if (token.current === current) {
          setPages(out);
          setTexts(textOut);
          void writeCachedDoc(key, out);
          void writeCachedJson(textKey, textOut);
        }
      } catch {
        if (token.current === current) setFailed(true);
      } finally {
        if (token.current === current) setRebuilding(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rebuilding]);

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
        <DocMarkupToolbar
          tool={markup.tool}
          setTool={markup.setTool}
          penColor={markup.penColor}
          setPenColor={markup.setPenColor}
          highlightColor={markup.highlightColor}
          setHighlightColor={markup.setHighlightColor}
        />
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
          <div key={index} style={{ width: `${zoom * 100}%` }}>
            <DocMarkupSurface
              ratio={ratios[index] ?? 1.414}
              tool={markup.tool}
              penColor={markup.penColor}
              highlightColor={markup.highlightColor}
              value={markup.annotationOf(index)}
              onChange={(next) => markup.update(index, next)}
            >
              <img
                src={src}
                alt={`${title} page ${index + 1}`}
                className="w-full rounded-md border bg-white shadow-sm"
                style={{ maxWidth: "none" }}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  if (!img.naturalWidth) return;
                  const ratio = img.naturalHeight / img.naturalWidth;
                  setRatios((current) =>
                    current[index] === ratio ? current : { ...current, [index]: ratio },
                  );
                }}
              />
              {texts?.[index] ? (
                <PdfTextLayer page={texts[index]!} selectable={markup.tool === "none"} />
              ) : null}
            </DocMarkupSurface>
          </div>
        ))}
      </div>

    </div>
  );
}

/**
 * Transparent but selectable copy of the page text, scaled to the rendered page
 * so selection and copy/paste work on top of the page image. Each run is
 * stretched horizontally to the width the PDF reports, so the selection
 * highlight lines up with the printed words.
 */
function PdfTextLayer({ page, selectable }: { page: PageText; selectable: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = width > 0 ? width / page.w : 1;

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 overflow-hidden"
      style={{
        zIndex: 20,
        pointerEvents: selectable ? "auto" : "none",
        cursor: selectable ? "text" : undefined,
      }}
    >
      <div
        className="absolute left-0 top-0 select-text"
        style={{
          width: page.w,
          height: page.h,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {page.runs.map((run, index) => (
          <span
            key={index}
            className="absolute whitespace-pre text-transparent"
            style={{
              left: run.x,
              top: run.y,
              fontSize: run.h,
              fontFamily: "sans-serif",
              lineHeight: 1,
              transformOrigin: "left top",
            }}
            ref={(el) => {
              if (!el) return;
              // Match the run's real width so the selection sits on the words.
              el.style.transform = "none";
              const natural = el.getBoundingClientRect().width / (scale || 1);
              if (natural > 0 && run.w > 0) {
                el.style.transform = `scaleX(${run.w / natural})`;
              }
            }}
          >
            {run.s}
          </span>
        ))}
      </div>
    </div>
  );
}

