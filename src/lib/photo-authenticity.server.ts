import { generateText } from "ai";
import { z } from "zod";

import { gatewayModel } from "./ai-gateway.server";

export type PhotoCheck = { ok: boolean; reason: string; confidence: number };

const schema = z.object({
  handDrawn: z.coerce.boolean(),
  kind: z.string().default(""),
  confidence: z.coerce.number().default(0),
  reason: z.string().default(""),
});

/**
 * Homework photos must be photographs of the student's own hand-written or
 * hand-drawn work on paper (or a whiteboard). Anything computer-generated —
 * a diagram saved from a website, a textbook scan, a screenshot, clip-art,
 * a typed document, an app-drawn figure — is treated as plagiarism.
 */
export async function checkHandDrawnPhotos(imageUrls: string[]): Promise<PhotoCheck> {
  if (imageUrls.length === 0) return { ok: true, reason: "", confidence: 0 };

  const system = [
    "You inspect an image a school student uploaded as their homework answer.",
    "Only a photograph of the student's OWN hand-written or hand-drawn work is allowed: pen or pencil on paper, in an exercise book, on graph paper, on a mini-whiteboard, or chalk/marker on a board, photographed with a phone or camera.",
    "Everything else is not allowed, including: a computer-drawn or vector diagram; a figure saved or screenshotted from a website, textbook, PDF, slide or app; clip-art; a typed or word-processed document; a printed sheet with no handwriting on it; an AI-generated image; a photo of a screen or monitor; a photo of someone else's printed answer.",
    "Tell-tale signs of a computer-generated image: perfectly uniform line weight, perfect circles and geometry, flat pure-white or transparent background with no paper texture, no shadows, no page edges, crisp anti-aliased typeset labels, browser or app chrome, watermarks, cursors, scrollbars.",
    "Tell-tale signs of genuine hand-drawn work: visible paper texture, ruled or squared lines, uneven pen strokes, smudges or eraser marks, handwriting, camera shadow or perspective, page edges, a desk or hand in frame.",
    "Judge the image itself, not whether the work is correct. A blurry or messy hand-drawn photo is still allowed.",
    'Reply with ONLY raw JSON: {"handDrawn":boolean,"kind":"short label such as hand-drawn on paper, computer diagram, screenshot, printed page, photo of screen","confidence":0-1,"reason":"one short sentence for the student"}',
  ].join(" ");

  const asImage = (url: string) =>
    ({ type: "image" as const, image: url.startsWith("data:") ? url : new URL(url) });

  for (const url of imageUrls) {
    try {
      const { text } = await generateText({
        model: gatewayModel(),
        system,
        messages: [
          {
            role: "user",
            content: [
              { type: "text" as const, text: "Is this a photo of hand-drawn or hand-written work?" },
              asImage(url),
            ],
          },
        ],
      });
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      const parsed = schema.parse(JSON.parse(text.slice(start >= 0 ? start : 0, end + 1)));
      const confidence = Math.max(0, Math.min(1, parsed.confidence));
      // Uploads must show positive evidence of hand-drawn work: an unsure
      // verdict is rejected too, so only clear handwriting/paper passes.
      const unsure = parsed.handDrawn && confidence < 0.55;
      if (!parsed.handDrawn || unsure) {
        const kind = parsed.kind.trim();
        return {
          ok: false,
          confidence: parsed.handDrawn ? 1 - confidence : confidence,
          reason: `Only photos of your own hand-drawn or hand-written work are accepted. This upload looks like ${kind || "a computer-generated or copied image"}, not something you drew by hand.`,
        };
      }
    } catch {
      // Never block honest work when the check itself fails.
      return { ok: true, reason: "", confidence: 0 };
    }
  }

  return { ok: true, reason: "", confidence: 0 };
}
