/**
 * Keeps slide text readable. PowerPoint decks often rely on a theme, a master
 * background or a placeholder colour we can't reproduce exactly, which can end
 * up drawing text in the same colour as the surface behind it — invisible words.
 * These helpers detect that and swap in a readable ink colour.
 */

/** Parses #rgb, #rrggbb, rgb()/rgba() into 0-255 channels. */
export function parseColor(value: string | null | undefined): [number, number, number] | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  if (text === "transparent" || text === "none") return null;
  if (text === "white") return [255, 255, 255];
  if (text === "black") return [0, 0, 0];
  const hex = text.startsWith("#") ? text.slice(1) : /^[0-9a-f]{3,8}$/.test(text) ? text : null;
  if (hex) {
    if (hex.length === 3) {
      const [r, g, b] = hex.split("") as [string, string, string];
      return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    return null;
  }
  const match = text.match(/rgba?\(([^)]+)\)/);
  if (!match?.[1]) return null;
  const parts = match[1].split(",").map((p) => Number.parseFloat(p.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null;
  return [parts[0]!, parts[1]!, parts[2]!];
}

function channelLuminance(channel: number) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: [number, number, number]) {
  return (
    0.2126 * channelLuminance(rgb[0]) +
    0.7152 * channelLuminance(rgb[1]) +
    0.0722 * channelLuminance(rgb[2])
  );
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number | null {
  const first = parseColor(a);
  const second = parseColor(b);
  if (!first || !second) return null;
  const l1 = relativeLuminance(first);
  const l2 = relativeLuminance(second);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const MIN_CONTRAST = 2.8;

/**
 * Returns a text colour that can always be read on `background`. The original
 * colour is kept whenever it already has enough contrast; otherwise the text
 * falls back to near-black or near-white, whichever the background allows.
 */
export function readableTextColor(
  color: string | null | undefined,
  background: string | null | undefined,
): string | undefined {
  const bg = parseColor(background);
  if (!bg) return color ?? undefined;
  const bgLight = relativeLuminance(bg) > 0.45;
  const ink = bgLight ? "#111111" : "#ffffff";
  if (!color) return ink;
  const ratio = contrastRatio(color, background ?? "");
  if (ratio == null) return color;
  return ratio >= MIN_CONTRAST ? color : ink;
}
