/**
 * Turns the *visual* parts of a lesson into images the AI summary can read:
 * the teacher's handwriting/drawings on the lesson canvas, and any drawing or
 * text boxes marked on the attached document.
 *
 * Everything here runs in the browser (canvas rasterising + the local markup
 * cache), and the result is handed to the summary server function.
 */

import type { SlideAnnotation } from "@/components/materials/SlideAnnotations";
import { readCachedJson } from "@/lib/doc-cache";
import type { NoteBlock } from "@/lib/notes.functions";

const MAX_DOC_PAGES = 6;

export type SummaryVisuals = {
  /** Rasterised ink from the lesson canvas (one image of all pen strokes). */
  canvasInk?: string;
  /** Rasterised drawing marked on the document, one image per annotated page. */
  docInk?: string[];
  /** Text typed into text boxes placed on the document. */
  docTexts?: string[];
};

function toJpeg(canvas: HTMLCanvasElement): string | null {
  try {
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

/** Draws the canvas ink blocks (SVG path strings) onto a white bitmap. */
export function renderCanvasInk(blocks: NoteBlock[]): string | null {
  if (typeof document === "undefined" || typeof Path2D === "undefined") return null;
  const ink = blocks.filter(
    (block): block is Extract<NoteBlock, { type: "ink" }> => block.type === "ink",
  );
  if (ink.length === 0) return null;

  const height = Math.min(
    4000,
    Math.max(600, ...ink.map((stroke) => (stroke.bottom ?? 0) + 80)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = Math.round(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of ink) {
    try {
      ctx.strokeStyle = stroke.color || "#111827";
      ctx.lineWidth = stroke.width || 3;
      ctx.stroke(new Path2D(stroke.d));
    } catch {
      // Skip an unparseable stroke rather than losing the whole image.
    }
  }
  return toJpeg(canvas);
}

function renderAnnotationInk(annotation: SlideAnnotation): string | null {
  if (typeof document === "undefined") return null;
  if (annotation.strokes.length === 0) return null;
  const maxY = Math.max(
    600,
    ...annotation.strokes.flatMap((stroke) => stroke.points.map((point) => point.y + 60)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = Math.round(Math.min(3000, maxY));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of annotation.strokes) {
    ctx.strokeStyle = stroke.color || "#dc2626";
    ctx.lineWidth = stroke.width || 4;
    ctx.beginPath();
    stroke.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  }
  return toJpeg(canvas);
}

/**
 * Reads the locally stored markup for the attached document (PDF pages or a
 * converted Word/slide document) and turns it into images plus typed text.
 */
export async function collectDocMarkup(materialId: string | null): Promise<{
  docInk: string[];
  docTexts: string[];
}> {
  const out = { docInk: [] as string[], docTexts: [] as string[] };
  if (!materialId) return out;

  const keys = [
    `pdf-annotations:material:${materialId}`,
    `office-annotations:docx:material:${materialId}`,
    `office-annotations:pptx:material:${materialId}`,
  ];

  for (const key of keys) {
    const saved = await readCachedJson<Record<number, SlideAnnotation>>(key);
    if (!saved) continue;
    for (const [index, annotation] of Object.entries(saved)) {
      if (!annotation) continue;
      for (const box of annotation.texts ?? []) {
        const text = box.text?.trim();
        if (text) out.docTexts.push(`Page ${Number(index) + 1}: ${text}`);
      }
      if (out.docInk.length < MAX_DOC_PAGES) {
        const image = renderAnnotationInk(annotation);
        if (image) out.docInk.push(image);
      }
    }
  }
  return out;
}

/** Everything drawn or typed on the canvas and the document, ready for the AI. */
export async function collectSummaryVisuals(
  blocks: NoteBlock[],
  materialId: string | null,
): Promise<SummaryVisuals> {
  const canvasInk = renderCanvasInk(blocks);
  const doc = await collectDocMarkup(materialId);
  return {
    ...(canvasInk ? { canvasInk } : {}),
    ...(doc.docInk.length > 0 ? { docInk: doc.docInk } : {}),
    ...(doc.docTexts.length > 0 ? { docTexts: doc.docTexts } : {}),
  };
}
