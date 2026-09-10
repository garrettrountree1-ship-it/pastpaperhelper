/**
 * iPhone photos arrive as HEIC, which no browser can display — they look like
 * broken or corrupted pictures. These helpers turn them into ordinary JPEGs,
 * both for new uploads and for pictures already stored as HEIC.
 */

/** True when a file name or link points at an Apple HEIC/HEIF picture. */
export function looksHeic(nameOrUrl: string) {
  return /\.(heic|heif)(\?|#|$)/i.test(nameOrUrl);
}

async function toJpegBlob(blob: Blob) {
  const { heicTo } = await import("heic-to");
  return (await heicTo({ blob, type: "image/jpeg", quality: 0.92 })) as Blob;
}

/** Convert a picked HEIC photo to JPEG so it can be shown and marked. */
export async function normalisePhotoFile(file: File): Promise<File> {
  const heic = looksHeic(file.name) || /heic|heif/i.test(file.type);
  if (!heic) return file;
  try {
    const jpeg = await toJpegBlob(file);
    const name = file.name.replace(/\.(heic|heif)$/i, "") + ".jpg";
    return new File([jpeg], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Convert a list of picked photos, leaving ordinary ones untouched. */
export async function normalisePhotoFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map((file) => normalisePhotoFile(file)));
}

/**
 * Give a browser-showable link for a stored picture. HEIC files are fetched and
 * converted in the browser; everything else is returned unchanged.
 */
export async function displayablePhotoUrl(url: string): Promise<string> {
  if (!looksHeic(url)) return url;
  const response = await fetch(url);
  const jpeg = await toJpegBlob(await response.blob());
  return URL.createObjectURL(jpeg);
}
