/**
 * Browser-side helpers: turn teacher uploads into page images so the exact
 * printed figures, diagrams and equations are preserved (never re-described).
 */

export type PageImage = { filename: string; mimeType: string; base64: string };

const MAX_PAGES = 30;
const RENDER_WIDTH = 1400;

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function dataUrlToBase64(dataUrl: string) {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

async function renderPdf(file: File): Promise<PageImage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: PageImage[] = [];
  const count = Math.min(doc.numPages, MAX_PAGES);
  for (let n = 1; n <= count; n += 1) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport } as never).promise;
    pages.push({
      filename: `${file.name.replace(/\.pdf$/i, "")}-page-${n}.jpg`,
      mimeType: "image/jpeg",
      base64: dataUrlToBase64(canvas.toDataURL("image/jpeg", 0.85)),
    });
    canvas.width = 0;
    canvas.height = 0;
  }
  return pages;
}

/** PDFs become one image per page; photos pass through; docs stay as raw files. */
export async function filesToPages(files: File[]): Promise<PageImage[]> {
  const out: PageImage[] = [];
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (file.type === "application/pdf" || name.endsWith(".pdf")) {
      out.push(...(await renderPdf(file)));
    } else {
      out.push({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        base64: await fileToBase64(file),
      });
    }
  }
  return out.slice(0, MAX_PAGES);
}
