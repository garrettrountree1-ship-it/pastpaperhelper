import { generateText } from "ai";
import { z } from "zod";

import { gatewayModel } from "./ai-gateway.server";

export type PhotoCheck = { ok: boolean; reason: string; confidence: number };

export type PhotoImageResult = {
  index: number;
  handDrawn: boolean;
  kind: string;
  confidence: number;
  reason: string;
};

const REJECTION_CONFIDENCE = 0.85;

const imageResultSchema = z.object({
  index: z.coerce.number().int().nonnegative(),
  handDrawn: z.boolean(),
  kind: z.string().default(""),
  confidence: z.coerce.number().default(0),
  reason: z.string().default(""),
});
const schema = z.object({ images: z.array(imageResultSchema) });

/**
 * Only block an upload when the classifier has strong evidence that it is not
 * hand-made. An ambiguous photo is safer to admit than to turn a genuine
 * student's work into an academic-integrity strike.
 */
export function evaluatePhotoResults(
  results: PhotoImageResult[],
  expectedCount: number,
): PhotoCheck {
  if (results.length !== expectedCount) return { ok: true, reason: "", confidence: 0 };

  const ordered = [...results].sort((a, b) => a.index - b.index);
  if (ordered.some((item, index) => item.index !== index)) {
    return { ok: true, reason: "", confidence: 0 };
  }

  for (const result of ordered) {
    const confidence = Math.max(0, Math.min(1, result.confidence));
    if (!result.handDrawn && confidence >= REJECTION_CONFIDENCE) {
      const kind = result.kind.trim();
      return {
        ok: false,
        confidence,
        reason: `Only photos of your own hand-drawn or hand-written work are accepted. This upload appears to be ${kind || "a digital or printed image with no hand-drawn work"}. If you drew it by hand, re-take the photo with the paper and page edges visible.`,
      };
    }
  }

  return { ok: true, reason: "", confidence: 0 };
}

/**
 * Homework photos must be photographs of the student's own hand-written or
 * hand-drawn work on paper (or a whiteboard). Anything computer-generated —
 * a diagram saved from a website, a textbook scan, a screenshot, clip-art,
 * a typed document, an app-drawn figure — is treated as plagiarism.
 */
export async function checkHandDrawnPhotos(imageUrls: string[]): Promise<PhotoCheck> {
  if (imageUrls.length === 0) return { ok: true, reason: "", confidence: 0 };

  const system = [
    "You inspect one or more images a school student uploaded as their homework answer.",
    "Only a photograph of the student's OWN hand-written or hand-drawn work is allowed: pen or pencil on paper, in an exercise book, on graph paper, on a mini-whiteboard, or chalk/marker on a board, photographed with a phone or camera.",
    "ALLOW hand-drawn graphs and geometric constructions. Graph axes, grid lines, ruled lines, plotted curves, bars, and shapes can be very straight or neat, especially when a student used graph paper, a ruler, compass, stencil, or protractor. Neatness, straight lines, symmetry, or printed graph-paper grids are NOT evidence of copying.",
    "ALLOW a printed worksheet, question, coordinate grid, map, or diagram when the student has visibly added their own handwriting, plotting, labels, construction, calculations, highlighting, or drawn answer. Classify the student's additions, not the blank template underneath them.",
    "Reject only when there is strong visual evidence that the submitted answer itself is digital or contains no student hand-work, including: a computer-drawn or vector diagram; a figure saved or screenshotted from a website, textbook, PDF, slide or app; clip-art; a wholly typed document; a printed sheet with no handwriting on it; an AI-generated image; or a photo of a screen or monitor.",
    "Tell-tale signs of a computer-generated image: perfectly uniform line weight, perfect circles and geometry, flat pure-white or transparent background with no paper texture, no shadows, no page edges, crisp anti-aliased typeset labels, browser or app chrome, watermarks, cursors, scrollbars.",
    "Tell-tale signs of genuine hand-drawn work: visible paper texture, ruled or squared lines, uneven pen strokes, smudges or eraser marks, handwriting, camera shadow or perspective, page edges, a desk or hand in frame.",
    "Look at the whole image and weigh several signs together. Do not reject from a single weak clue. If student-made marks are plausible or the evidence is ambiguous, set handDrawn to true with appropriately low confidence.",
    "Judge the image itself, not whether the work is correct. A blurry or messy hand-drawn photo is still allowed.",
    'Return one result for every attached image, in the same order. Reply with ONLY raw JSON: {"images":[{"index":0,"handDrawn":boolean,"kind":"short label such as hand-drawn on paper, computer diagram, screenshot, printed page, photo of screen","confidence":0-1,"reason":"one short sentence for the student"}]}',
  ].join(" ");

  const asImage = (url: string) => ({
    type: "image" as const,
    image: url.startsWith("data:") ? url : new URL(url),
  });

  try {
    const { text } = await generateText({
      model: gatewayModel(),
      system,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text" as const,
              text: `Inspect all ${imageUrls.length} attached images. Return exactly ${imageUrls.length} indexed results.`,
            },
            ...imageUrls.map(asImage),
          ],
        },
      ],
    });
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = schema.parse(JSON.parse(text.slice(start >= 0 ? start : 0, end + 1)));
    return evaluatePhotoResults(parsed.images, imageUrls.length);
  } catch {
    // Never block honest work when the check itself fails.
    return { ok: true, reason: "", confidence: 0 };
  }

  return { ok: true, reason: "", confidence: 0 };
}
