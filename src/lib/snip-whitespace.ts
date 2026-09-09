/**
 * Tidies the top and bottom edge of a question snip.
 *
 * The cut points come from reading the paper, so they can land a hair through a
 * line of print or across a graph. Here the page picture is measured row by row:
 * an edge sitting on print is first moved to the nearest empty strip (whichever
 * side is closer), then both edges are pulled in over any remaining blank paper
 * so the piece holds just the question. That keeps words and diagrams whole and
 * lets two pieces of the same question sit together with no gap between them.
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

/** Distance to the nearest run of blank rows in one direction, or null. */
function blankEdge(
  rows: boolean[],
  start: number,
  direction: -1 | 1,
  limit: number,
  clearance: number,
) {
  // A single pale scan-line can pass through the gap inside a letter. Require a
  // full text-line-sized strip of paper before treating a boundary as safe.
  const need = Math.max(6, clearance);
  let run = 0;
  for (let step = 0; step <= limit; step += 1) {
    const y = start + direction * step;
    if (y < 0 || y >= rows.length) return direction === -1 ? 0 : rows.length - 1;
    if (rows[y]) {
      run += 1;
      // Keep the cut at the far edge of the clear run. Returning its midpoint
      // left only half a line of paper and anti-aliased letters were clipped.
      if (run >= need) return y;
    } else {
      run = 0;
    }
  }
  return null;
}

/**
 * Moves a cut that sits on print onto blank paper.
 *
 * `grow` is deliberately tiny: growing a piece can pull in whatever is printed
 * next — the following question, or an answer / mark-scheme block — so an edge
 * may only reach outwards by a hair, while pulling inwards (shrinking) is free.
 */
function offPrint(
  rows: boolean[],
  row: number,
  inward: -1 | 1,
  shrink: number,
  grow: number,
  clearance: number,
) {
  const outward = (inward === 1 ? -1 : 1) as -1 | 1;
  const grown = blankEdge(rows, row, outward, grow, clearance);
  const shrunk = blankEdge(rows, row, inward, shrink, clearance);
  // If a proposed edge crosses a printed line, moving inward discards the
  // remainder of that line. First move outward to the clear paper immediately
  // before/after it; only shrink when the page edge leaves no outward room.
  return grown ?? shrunk ?? row;
}

/** The same band, cut on empty paper and trimmed of blank edges. */
export async function snapBandToWhitespace(url: string, band: Band): Promise<Band> {
  const rows = await loadRows(url);
  if (!rows || rows.length < 20) return band;
  const height = rows.length;
  const shrinkLimit = Math.round(height * 0.08);
  const growLimit = Math.max(12, Math.round(height * 0.045));
  // A full line of white paper, not merely a few pixels, around the first and
  // last ink. This also covers symbols and the outer strokes of diagrams.
  const pad = Math.max(8, Math.round(height * 0.02));

  const rawTop = Math.min(height - 1, Math.max(0, Math.round(band.top * height)));
  const rawBottom = Math.min(height - 1, Math.max(0, Math.round(band.bottom * height)));

  // Top may only slide down (into the band) freely; bottom may only slide up.
  let top = offPrint(rows, rawTop, 1, shrinkLimit, growLimit, pad);
  let bottom = offPrint(rows, rawBottom, -1, shrinkLimit, growLimit, pad);
  if (bottom <= top) return band;

  // Trim the blank paper at each end so the piece holds only the question and
  // two pieces of one question meet without a gap.
  let firstInk = top;
  while (firstInk < bottom && rows[firstInk]) firstInk += 1;
  let lastInk = bottom;
  while (lastInk > firstInk && rows[lastInk]) lastInk -= 1;
  if (lastInk > firstInk) {
    top = Math.max(top, firstInk - pad);
    bottom = Math.min(bottom, lastInk + pad);
  }

  // Safety net: a faint page (thin print, a table rule, a pale scan) can make
  // the row measurement believe nearly everything is empty paper, which would
  // squeeze the piece down to a sliver and look blank on screen. Whenever the
  // tidy-up would lose a large part of the chosen piece, keep the chosen piece
  // exactly as the teacher (or the reading step) set it.
  const askedRows = rawBottom - rawTop;
  const keptRows = bottom - top;
  if (askedRows > 0 && keptRows < Math.max(askedRows * 0.6, height * 0.02)) return band;

  return {
    top: Math.max(0, top / height),
    bottom: Math.min(1, (bottom + 1) / height),
  };
}

