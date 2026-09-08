/**
 * Browser-side: turns the converted slide PDF into one picture per slide, so
 * the scrolling view shows the deck exactly as PowerPoint drew it.
 */

const RENDER_WIDTH = 1600;
const MAX_SLIDES = 200;

export async function pdfToSlideImages(url: string): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read the slide pages (${response.status})`);
  const doc = await pdfjs.getDocument({ data: await response.arrayBuffer() }).promise;

  const pages: string[] = [];
  const count = Math.min(doc.numPages, MAX_SLIDES);
  for (let n = 1; n <= count; n += 1) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = RENDER_WIDTH / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport } as never).promise;
    pages.push(canvas.toDataURL("image/jpeg", 0.9));
    canvas.width = 0;
    canvas.height = 0;
  }
  return pages;
}
