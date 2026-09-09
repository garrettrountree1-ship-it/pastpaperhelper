import { pageWithoutCrop, parseCropFragment, withCrop } from "@/lib/snip-crop";

/**
 * Starting crop for a question inserted after another one: it begins where the
 * previous question's cut ended, so the teacher only nudges the bottom edge.
 */
export function cropAfter(reference: string): string {
  const band = parseCropFragment(reference) ?? { top: 0, bottom: 1 };
  const top = Math.min(0.88, Math.max(0, band.bottom));
  const bottom = Math.min(1, Math.max(top + 0.12, band.bottom + 0.3));
  return withCrop(pageWithoutCrop(reference), { top, bottom }, true);
}
