/**
 * Browser-side: turn a Word (.docx) upload into page pictures, so questions can
 * be shown to students exactly as printed (tables, graphs, symbols and all)
 * instead of as re-typed text.
 *
 * Word files have no fixed pages we can read, so the document is laid out at A4
 * width and cut into A4-height pages, then each page is painted into a picture.
 */

import type { PageImage } from "./pdf-pages";

const PAGE_W = 794; // A4 at 96 dpi
const PAGE_H = 1123;
const RENDER_SCALE = 1.75; // output ≈ 1390px wide, matching the PDF renderer
const MAX_PAGES = 30;

const PAGE_CSS = `
  * { box-sizing: border-box; }
  body, div, p, li, td, th { font-family: Arial, Helvetica, sans-serif; color: #111111; }
  p, li { font-size: 15px; line-height: 1.5; margin: 0 0 10px; }
  h1 { font-size: 26px; margin: 0 0 14px; }
  h2 { font-size: 22px; margin: 0 0 12px; }
  h3 { font-size: 18px; margin: 0 0 10px; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 12px; }
  td, th { border: 1px solid #999999; padding: 4px 6px; font-size: 14px; }
  ol, ul { margin: 0 0 10px; padding-left: 24px; }
`;

function serialise(node: HTMLElement) {
  return new XMLSerializer().serializeToString(node);
}

async function pageToBase64(inner: string, offset: number): Promise<string> {
  const width = PAGE_W;
  const height = PAGE_H;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * RENDER_SCALE)}" ` +
    `height="${Math.round(height * RENDER_SCALE)}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;background:#ffffff">` +
    `<style>${PAGE_CSS}</style>` +
    `<div style="transform:translateY(${-offset}px);padding:56px 64px;">${inner}</div>` +
    `</div></foreignObject></svg>`;

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't draw a page of that Word file."));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * RENDER_SCALE);
  canvas.height = Math.round(height * RENDER_SCALE);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL("image/jpeg", 0.85);
  canvas.width = 0;
  canvas.height = 0;
  return data.slice(data.indexOf(",") + 1);
}

/** One picture per A4 page of the Word file. */
export async function docxToPages(file: File): Promise<PageImage[]> {
  const mammoth = await import("mammoth/mammoth.browser.js");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });

  // Lay the document out off-screen at A4 width to learn its true height.
  const holder = document.createElement("div");
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;");
  const page = document.createElement("div");
  page.setAttribute(
    "style",
    `width:${PAGE_W}px;background:#ffffff;`,
  );
  const style = document.createElement("style");
  style.textContent = PAGE_CSS;
  const body = document.createElement("div");
  body.setAttribute("style", "padding:56px 64px;");
  body.innerHTML = result.value;
  page.append(style, body);
  holder.append(page);
  document.body.append(holder);

  // Wait for embedded pictures so the measured height includes them.
  await Promise.all(
    Array.from(body.querySelectorAll("img")).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );

  const total = body.scrollHeight;
  const step = PAGE_H - 112;

  // Work out where each page ends by looking at the blocks themselves, so a
  // paragraph, table or diagram is never sliced in half by a page break.
  const bodyTop = body.getBoundingClientRect().top + 56;
  const blocks = Array.from(body.children).map((child) => {
    const box = (child as HTMLElement).getBoundingClientRect();
    return { top: box.top - bodyTop, bottom: box.bottom - bodyTop };
  });

  const offsets: number[] = [0];
  let pageTop = 0;
  for (const block of blocks) {
    if (block.bottom <= pageTop + step) continue;
    // This block runs past the bottom of the page: start a new page at its top,
    // unless the block alone is taller than a page (then it has to be split).
    const start = block.top > pageTop ? block.top : pageTop + step;
    if (start <= pageTop) continue;
    pageTop = start;
    offsets.push(pageTop);
    if (offsets.length >= MAX_PAGES) break;
  }
  while (pageTop + step < total && offsets.length < MAX_PAGES) {
    pageTop += step;
    offsets.push(pageTop);
  }

  const inner = serialise(body).replace(/^<div[^>]*>/, "").replace(/<\/div>$/, "");
  document.body.removeChild(holder);

  const pages: PageImage[] = [];
  const stem = file.name.replace(/\.docx$/i, "");
  for (let n = 0; n < offsets.length; n += 1) {
    pages.push({
      filename: `${stem}-page-${n + 1}.jpg`,
      mimeType: "image/jpeg",
      base64: await pageToBase64(inner, offsets[n] ?? n * step),
    });
  }
  return pages;
}
