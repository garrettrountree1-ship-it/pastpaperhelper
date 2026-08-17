export const BULLET = "•";

/** Multi-mark written questions get one locked bullet per mark, as a marks checklist. */
export function bulletTargetFor(marks: number, requiresPhoto: boolean) {
  if (requiresPhoto) return 0;
  return marks >= 2 ? marks : 0;
}

/** Strips bullet markers so we can judge whether the student wrote anything. */
export function stripBullets(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*[•\-*]\s?/, ""))
    .join("\n");
}

/**
 * Rebuilds the bullet scaffold after every keystroke so the markers can never be
 * deleted: content is preserved, bullets are re-applied, and the line count never
 * drops below the number of marks available.
 */
export function normaliseBullets(value: string, target: number) {
  if (target <= 0) return value;
  const lines = value.split("\n").map((line) => line.replace(/^\s*[•\-*]\s?/, ""));
  while (lines.length < target) lines.push("");
  return lines.map((line) => `${BULLET} ${line}`).join("\n");
}
