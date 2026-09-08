/**
 * Moves the top and bottom edge of a question snip onto blank paper.
 *
 * The cut points come from reading the paper, so they can land a hair through a
 * line of print or across a graph. Here the page picture is measured row by row
 * and each edge is nudged outwards to the nearest empty strip, so a snip never
 * slices through words or a diagram.
 */

type Band = { top: number; bottom: number };

const cache = new Map<string, Promise<boolean[] | null>>();

function pageKey(url: string) {
  return url.split("?")[0] ?? url;
}

function loadRows(url: string): Promise<boolean[] | null> {
  const key = pageKey(url);
  const existing = cache.get(key);
  if (existing) return existing;

  const job = (async () => {
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("no picture"));
        img.src = url;
      });
      const width = Math.min(400, image.naturalWidth || 400);
      const scale = width / (image.naturalWidth || width);
      const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const { data } = context.getImageData(0, 0, width, height);
      const rows: boolean[] = [];
      for (let y = 0; y < height; y += 1) {
        let ink = 0;
        for (let x = 0; x < width; x += 1) {
          const at = (y * width + x) * 4;
          const r = data[at] ?? 255;
          const g = data[at + 1] ?? 255;
          const b = data[at + 2] ?? 255;
          if ((r + g + b) / 3 < 205) ink += 1;
        }
        rows.push(ink / width < 0.004);
      }
      canvas.width = 0;
      canvas.height = 0;
      return rows;
    } catch {
      return null; // Cross-origin or unreadable: keep the band as it came.
    }
  })();

  cache.set(key, job);
  return job;
}

/** Finds a run of blank rows, walking outwards from a starting row. */
function blankEdge(rows: boolean[], start: number, direction: -1 | 1, limit: number) {
  const need = Math.max(2, Math.round(rows.length * 0.004));
  let run = 0;
  for (let step = 0; step <= limit; step += 1) {
    const y = start + direction * step;
    if (y < 0 || y >= rows.length) return direction === -1 ? 0 : rows.length - 1;
    if (rows[y]) {
      run += 1;
      if (run >= need) return y;
    } else {
      run = 0;
    }
  }
  return null;
}

/** The same band, with both edges resting on empty paper wherever possible. */
export async function snapBandToWhitespace(url: string, band: Band): Promise<Band> {
  const rows = await loadRows(url);
  if (!rows || rows.length < 20) return band;
  const height = rows.length;
  const limit = Math.round(height * 0.08);
  const topRow = Math.min(height - 1, Math.max(0, Math.round(band.top * height)));
  const bottomRow = Math.min(height - 1, Math.max(0, Math.round(band.bottom * height)));

  const top = blankEdge(rows, topRow, -1, limit);
  const bottom = blankEdge(rows, bottomRow, 1, limit);

  return {
    top: top == null ? band.top : Math.max(0, top / height),
    bottom: bottom == null ? band.bottom : Math.min(1, (bottom + 1) / height),
  };
}
