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

/**
 * Text that would let a student search for the original paper or its mark
 * scheme (year, exam board, paper/session codes, copyright lines, URLs).
 */
const IDENTIFYING_TEXT: RegExp[] = [
  /\b(19|20)\d{2}\b/,
  /©|\(c\)\s*(19|20)\d{2}/i,
  /\bucles\b|\bcambridge\b|\bcaie\b|\bcie\b|\bedexcel\b|\bpearson\b|\baqa\b|\bocr\b|\bwjec\b|\bib\b|\bibo\b|\binternational baccalaureate\b/i,
  /\b(igcse|gcse|a[- ]?level|as level|o[- ]?level|diploma programme)\b/i,
  /\b\d{4}\/\d{2}\b/,
  /\b[0-9]{4}[A-Z]?\/[0-9A-Z]{1,3}\b/,
  /\b(may|june|october|november|february|march|january)\/?(19|20)?\d{0,2}\b.*\b(19|20)\d{2}\b/i,
  /\bwww\.|https?:\/\/|\.com\b|\.org\b|\.net\b/i,
  /\bpaper\s*\d+\b/i,
  /\bquestion paper\b|\bmark scheme\b|\bexaminer\b|\bsyllabus\b|\bcandidate (name|number)\b|\bcentre number\b/i,
  /\bturn over\b|\bblank page\b|\bdo not write\b|\bfor examiner'?s use\b/i,
];

type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

/**
 * Paints white boxes over header/footer bands and any identifying text so the
 * page students see contains only the questions and diagrams.
 */
function maskIdentifyingText(
  items: TextItem[],
  context: CanvasRenderingContext2D,
  viewport: { transform: number[]; height: number; width: number },
  scale: number,
) {
  const pad = 3 * scale;
  const topBand = viewport.height * 0.035;
  const bottomBand = viewport.height * 0.965;
  context.fillStyle = "#ffffff";
  for (const item of items) {
    const text = (item.str ?? "").trim();
    if (!text) continue;
    // pdf.js transform: [a, b, c, d, e, f] in PDF space; e/f is the origin.
    const x = (item.transform[4] ?? 0) * scale;
    const yFromTop = viewport.height - (item.transform[5] ?? 0) * scale;

    const height = Math.max((item.height || 10) * scale, 8 * scale);
    const width = Math.max((item.width || text.length * 5) * scale, 4 * scale);
    const inMargin = yFromTop <= topBand || yFromTop >= bottomBand;
    if (!inMargin && !IDENTIFYING_TEXT.some((pattern) => pattern.test(text))) continue;
    context.fillRect(x - pad, yFromTop - height - pad, width + pad * 2, height + pad * 2);
  }
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
    const scale = RENDER_WIDTH / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport } as never).promise;
    try {
      const content = await page.getTextContent();
      maskIdentifyingText(
        (content.items as TextItem[]).filter((item) => typeof item?.str === "string"),
        context,
        { transform: viewport.transform, height: canvas.height, width: canvas.width },
        scale,
      );
    } catch {
      // No text layer (scanned page) — the render already has no extractable text.
    }
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
