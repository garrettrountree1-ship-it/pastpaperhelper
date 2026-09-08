export type SnipCrop = { top: number; bottom: number };

export function parseCropFragment(value: string): SnipCrop | null {
  const at = value.indexOf("#crop=");
  if (at === -1) return null;
  const [topValue, bottomPart] = value.slice(at + 6).split(",");
  const bottomValue = bottomPart?.split(";")[0];
  const top = Number(topValue);
  const bottom = Number(bottomValue);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) return null;
  return { top: Math.max(0, top), bottom: Math.min(1, bottom) };
}

export function pageWithoutCrop(value: string) {
  const at = value.indexOf("#crop=");
  return at === -1 ? value : value.slice(0, at);
}

export function withCrop(value: string, crop: SnipCrop, manual = false) {
  return `${pageWithoutCrop(value)}#crop=${crop.top.toFixed(4)},${crop.bottom.toFixed(4)}${manual ? ";manual" : ""}`;
}