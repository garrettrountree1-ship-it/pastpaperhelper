import { readableSymbols } from "@/lib/math-text";

/**
 * Dependable .pptx reader: turns a deck into positioned text, shape and image
 * boxes per slide so slides can be rendered as plain scrollable HTML pages.
 *
 * Fidelity notes:
 * - PowerPoint geometry is in EMU (914400 per inch); we convert to CSS px at
 *   96dpi. Font sizes are in points, so they are converted separately (x4/3).
 * - Empty placeholders on a slide inherit their position from the slide layout
 *   and master, so those must be resolved or text lands in the wrong place.
 * - Layout/master shapes (backgrounds, logos, decorative bars) are drawn under
 *   the slide's own shapes, which is where most "missing images" live.
 * - Images become base64 data URLs (not blob: URLs) so a parsed deck can be
 *   cached in IndexedDB and reopened instantly.
 */
const EMU_PER_PX = 9525;
const PT_TO_PX = 4 / 3;

export type PptxRun = {
  text: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string | null;
  font: string | null;
};

export type PptxParagraph = {
  align: string;
  bullet: string | null;
  level: number;
  lineHeight: number;
  spaceBefore: number;
  spaceAfter: number;
  runs: PptxRun[];
};

export type PptxShape =
  | {
      type: "text";
      x: number;
      y: number;
      w: number;
      h: number;
      rot: number;
      anchor: "t" | "ctr" | "b";
      wrap: boolean;
      insets: [number, number, number, number];
      fill: string | null;
      line: { color: string; width: number } | null;
      radius: number;
      paragraphs: PptxParagraph[];
    }
  | {
      type: "shape";
      x: number;
      y: number;
      w: number;
      h: number;
      rot: number;
      fill: string | null;
      line: { color: string; width: number } | null;
      radius: number;
    }
  | { type: "image"; x: number; y: number; w: number; h: number; rot: number; src: string };

export type PptxSlide = { shapes: PptxShape[]; background: string | null };
export type PptxDeck = { width: number; height: number; slides: PptxSlide[] };

const px = (emu: string | null | undefined) => (emu ? Number(emu) / EMU_PER_PX : 0);

function firstChild(parent: Element, localName: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) return child;
  }
  return null;
}

function children(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((c) => c.localName === localName);
}

function descendant(parent: Element, path: string[]): Element | null {
  let node: Element | null = parent;
  for (const part of path) {
    if (!node) return null;
    node = firstChild(node, part);
  }
  return node;
}

function parseXml(text: string) {
  return new DOMParser().parseFromString(text, "application/xml");
}

function relTargets(relsXml: string | null) {
  const map = new Map<string, string>();
  if (!relsXml) return map;
  const doc = parseXml(relsXml);
  for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

function resolvePath(base: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/");
  parts.pop();
  for (const segment of target.split("/")) {
    if (segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

type Frame = { x: number; y: number; w: number; h: number; rot: number; flipH: boolean };

function xfrmOf(node: Element | null): Frame | null {
  if (!node) return null;
  const off = firstChild(node, "off");
  const ext = firstChild(node, "ext");
  return {
    x: px(off?.getAttribute("x")),
    y: px(off?.getAttribute("y")),
    w: px(ext?.getAttribute("cx")),
    h: px(ext?.getAttribute("cy")),
    rot: Number(node.getAttribute("rot") ?? 0) / 60000,
    flipH: node.getAttribute("flipH") === "1",
  };
}

/** Resolves a theme colour reference or literal colour to a CSS hex string. */
function colorOf(holder: Element | null, theme: Map<string, string>): string | null {
  if (!holder) return null;
  const srgb = firstChild(holder, "srgbClr");
  if (srgb?.getAttribute("val")) return `#${srgb.getAttribute("val")}`;
  const scheme = firstChild(holder, "schemeClr");
  const name = scheme?.getAttribute("val");
  if (name) {
    const mapped = theme.get(name === "tx1" ? "dk1" : name === "bg1" ? "lt1" : name === "tx2" ? "dk2" : name === "bg2" ? "lt2" : name);
    if (mapped) return `#${mapped}`;
    if (name === "tx1" || name === "dk1") return "#000000";
    if (name === "bg1" || name === "lt1") return "#ffffff";
  }
  return null;
}

function fillOf(spPr: Element | null, theme: Map<string, string>): string | null {
  if (!spPr) return null;
  if (firstChild(spPr, "noFill")) return null;
  const solid = firstChild(spPr, "solidFill");
  if (solid) return colorOf(solid, theme);
  const grad = firstChild(spPr, "gradFill");
  if (grad) {
    const stop = grad.getElementsByTagName("a:gs")[0];
    return stop ? colorOf(stop, theme) : null;
  }
  return null;
}

function lineOf(spPr: Element | null, theme: Map<string, string>) {
  const ln = spPr ? firstChild(spPr, "ln") : null;
  if (!ln || firstChild(ln, "noFill")) return null;
  const solid = firstChild(ln, "solidFill");
  const color = colorOf(solid, theme);
  if (!color) return null;
  const w = Number(ln.getAttribute("w") ?? 12700) / EMU_PER_PX;
  return { color, width: Math.max(1, Number(w.toFixed(2))) };
}

const AUTO_BULLETS = ["•", "◦", "▪", "·"];

type TextDefaults = { size: number; bold: boolean; color: string | null; font: string | null };

function defaultsForPlaceholder(type: string | null): TextDefaults {
  if (type === "title" || type === "ctrTitle") {
    return { size: 44, bold: false, color: null, font: null };
  }
  if (type === "subTitle") return { size: 24, bold: false, color: null, font: null };
  return { size: 18, bold: false, color: null, font: null };
}

function placeholderOf(sp: Element): { type: string | null; idx: string | null } | null {
  const ph =
    descendant(sp, ["nvSpPr", "nvPr", "ph"]) ??
    descendant(sp, ["nvPicPr", "nvPr", "ph"]) ??
    descendant(sp, ["nvGraphicFramePr", "nvPr", "ph"]);
  if (!ph) return null;
  return { type: ph.getAttribute("type"), idx: ph.getAttribute("idx") };
}

function isPowerPointPrompt(sp: Element): boolean {
  const text = Array.from(sp.getElementsByTagName("a:t"))
    .map((node) => node.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!text) return false;
  return (
    text.includes("click to edit master") ||
    text.includes("click to edit title style") ||
    text.includes("click to edit subtitle style") ||
    text.includes("click to edit body style") ||
    text.includes("click to add title") ||
    text.includes("click to add text")
  );
}

function textShape(
  sp: Element,
  frame: Frame | null,
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number,
  theme: Map<string, string>,
): PptxShape | null {
  const body = firstChild(sp, "txBody") ?? firstChild(sp, "txbxContent");
  if (!body) return null;

  const ph = placeholderOf(sp);
  const base = defaultsForPlaceholder(ph?.type ?? null);
  const bodyPr = firstChild(body, "bodyPr");
  const autofit = bodyPr ? firstChild(bodyPr, "normAutofit") : null;
  const fontScale = Number(autofit?.getAttribute("fontScale") ?? 100000) / 100000;
  const lnSpcReduce = Number(autofit?.getAttribute("lnSpcReduction") ?? 0) / 100000;

  const paragraphs: PptxParagraph[] = [];
  for (const p of children(body, "p")) {
    const pPr = firstChild(p, "pPr");
    const runs: PptxRun[] = [];
    for (const child of Array.from(p.children)) {
      if (child.localName === "br") {
        runs.push({
          text: "\n",
          size: base.size,
          bold: false,
          italic: false,
          underline: false,
          color: null,
          font: null,
        });
        continue;
      }
      if (child.localName !== "r" && child.localName !== "fld") continue;
      const rPr = firstChild(child, "rPr") ?? firstChild(child, "defRPr");
      const solid = rPr ? firstChild(rPr, "solidFill") : null;
      const latin = rPr ? firstChild(rPr, "latin") : null;
      const size = Number(rPr?.getAttribute("sz") ?? base.size * 100) / 100;
      runs.push({
        text: readableSymbols(firstChild(child, "t")?.textContent ?? ""),
        size: Number((size * fontScale * PT_TO_PX).toFixed(2)),
        bold: rPr?.getAttribute("b") === "1",
        italic: rPr?.getAttribute("i") === "1",
        underline: Boolean(rPr?.getAttribute("u") && rPr.getAttribute("u") !== "none"),
        color: colorOf(solid, theme),
        font: latin?.getAttribute("typeface") ?? null,
      });
    }
    if (runs.length === 0) {
      // Keep interior blank lines (they carry the deck's rhythm) but drop
      // leading/trailing empties so boxes are not padded with nothing.
      if (paragraphs.length === 0) continue;
      paragraphs.push({
        align: "l",
        bullet: null,
        level: 0,
        lineHeight: 1.2,
        spaceBefore: 0,
        spaceAfter: 0,
        runs: [],
      });
      continue;
    }

    const level = Number(pPr?.getAttribute("lvl") ?? 0);
    const buNone = pPr ? firstChild(pPr, "buNone") : null;
    const buChar = pPr ? firstChild(pPr, "buChar") : null;
    const buAuto = pPr ? firstChild(pPr, "buAutoNum") : null;
    const lnSpcPct = pPr ? descendant(pPr, ["lnSpc", "spcPct"]) : null;
    const spcBef = pPr ? descendant(pPr, ["spcBef", "spcPts"]) : null;
    const spcAft = pPr ? descendant(pPr, ["spcAft", "spcPts"]) : null;
    const isBulletList = ph?.type !== "title" && ph?.type !== "ctrTitle" && ph?.type !== "subTitle";

    // PowerPoint's own numbering: honour the deck's start value and count only
    // the numbered items at this same indent level, so a list that starts at 3
    // (or restarts) shows exactly the numbers the teacher sees in PowerPoint.
    let autoNumber: string | null = null;
    if (buAuto && !buNone) {
      const startAt = Number(buAuto.getAttribute("startAt") ?? 1);
      let index = 0;
      for (let i = paragraphs.length - 1; i >= 0; i -= 1) {
        const previous = paragraphs[i]!;
        if (previous.level !== level) continue;
        if (!previous.bullet || !/^\d/.test(previous.bullet)) break;
        index += 1;
      }
      autoNumber = `${startAt + index}.`;
    }

    paragraphs.push({
      align: pPr?.getAttribute("algn") ?? "l",
      bullet: buNone
        ? null
        : buChar
          ? (buChar.getAttribute("char") ?? "•")
          : autoNumber
            ? autoNumber
            : isBulletList && body.getElementsByTagName("a:buChar").length > 0
              ? AUTO_BULLETS[Math.min(level, AUTO_BULLETS.length - 1)]!
              : null,
      level,
      lineHeight: Math.max(
        1,
        (lnSpcPct ? Number(lnSpcPct.getAttribute("val") ?? 100000) / 100000 : 1.2) - lnSpcReduce,
      ),
      spaceBefore: spcBef ? Number(spcBef.getAttribute("val") ?? 0) / 100 * PT_TO_PX : 0,
      spaceAfter: spcAft ? Number(spcAft.getAttribute("val") ?? 0) / 100 * PT_TO_PX : 0,
      runs,
    });
  }

  while (paragraphs.length && paragraphs[paragraphs.length - 1]!.runs.length === 0) {
    paragraphs.pop();
  }
  if (!paragraphs.some((p) => p.runs.some((r) => r.text.trim()))) return null;

  const spPr = firstChild(sp, "spPr");
  const geom = spPr ? firstChild(spPr, "prstGeom") : null;
  const anchorAttr = bodyPr?.getAttribute("anchor");
  const inset = (name: string, fallback: number) =>
    px(bodyPr?.getAttribute(name)) || (bodyPr?.getAttribute(name) === "0" ? 0 : fallback);

  return {
    type: "text",
    x: (frame?.x ?? 0) * scaleX + offsetX,
    y: (frame?.y ?? 0) * scaleY + offsetY,
    w: (frame?.w ?? 0) * scaleX,
    h: (frame?.h ?? 0) * scaleY,
    rot: frame?.rot ?? 0,
    anchor: anchorAttr === "ctr" ? "ctr" : anchorAttr === "b" ? "b" : "t",
    wrap: bodyPr?.getAttribute("wrap") !== "none",
    insets: [inset("lIns", 9.6), inset("tIns", 4.8), inset("rIns", 9.6), inset("bIns", 4.8)],
    fill: fillOf(spPr, theme),
    line: lineOf(spPr, theme),
    radius: geom?.getAttribute("prst")?.startsWith("round") ? 8 : 0,
    paragraphs,
  };
}

/** Detects the real image type from magic bytes; PowerPoint file extensions lie often. */
function sniffImageType(bytes: Uint8Array, ext: string): string | null {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp";
  if (b[0] === 0x3c && (b[1] === 0x3f || b[1] === 0x73)) return "image/svg+xml";
  // TIFF, EMF and WMF cannot be displayed by browsers at all.
  if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) return null;
  if (b[0] === 0x01 && b[1] === 0x00 && b[2] === 0x00 && b[3] === 0x00) return null;
  if (b[0] === 0xd7 && b[1] === 0xcd) return null;
  if (ext === "svg") return "image/svg+xml";
  if (ext === "png" || ext === "gif" || ext === "bmp" || ext === "webp") return `image/${ext}`;
  if (ext === "jpg" || ext === "jpeg" || ext === "jfif") return "image/jpeg";
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Slide photos are usually far larger than the pane they are shown in, and they
 * dominate both the parse time and the size of the cached render. Re-encode big
 * raster images to a screen-sized WebP; keep the original when that would not
 * actually be smaller, or when the browser cannot decode it here.
 */
async function shrinkImage(
  bytes: Uint8Array,
  type: string,
  maxEdge: number,
  quality: number,
): Promise<{ bytes: Uint8Array; type: string }> {
  const original = { bytes, type };
  if (type === "image/svg+xml" || type === "image/gif") return original;
  if (bytes.length < 80_000) return original;
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return original;
  }
  try {
    const source = new Uint8Array(bytes);
    const bitmap = await createImageBitmap(new Blob([source.buffer as ArrayBuffer], { type }));
    const factor = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * factor));
    const height = Math.max(1, Math.round(bitmap.height * factor));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/webp", quality });
    if (!blob || blob.size >= bytes.length) return original;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: "image/webp" };
  } catch {
    return original;
  }
}

export type PptxParseOptions = {
  /** Called as each slide finishes so the first slide can be shown immediately. */
  onSlide?: (slide: PptxSlide, index: number, total: number) => void;
  /** Called with the deck built so far, so early slides can be shown at once. */
  onPartialDeck?: (deck: PptxDeck) => void;
  /** Longest edge kept for embedded photos (px). */
  maxImageEdge?: number;
  /** WebP quality for re-encoded photos. */
  imageQuality?: number;
};

export async function parsePptx(
  buffer: ArrayBuffer,
  options: PptxParseOptions = {},
): Promise<PptxDeck> {
  const maxEdge = options.maxImageEdge ?? 1600;
  const quality = options.imageQuality ?? 0.82;
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  const read = async (path: string) => {
    const file = zip.file(path) ?? zip.file(decodeURIComponent(path));
    return file ? await file.async("text") : null;
  };

  /** Media entries are shared between slides, so encode each one only once. */
  const mediaUrls = new Map<string, string | null>();
  const mediaUrl = async (mediaPath: string): Promise<string | null> => {
    if (mediaUrls.has(mediaPath)) return mediaUrls.get(mediaPath) ?? null;
    let url: string | null = null;
    const file = zip.file(mediaPath) ?? zip.file(decodeURIComponent(mediaPath));
    if (file) {
      const bytes = await file.async("uint8array");
      const ext = mediaPath.split(".").pop()?.toLowerCase() ?? "";
      const type = bytes.length > 12 ? sniffImageType(bytes, ext) : null;
      if (type) {
        const small = await shrinkImage(bytes, type, maxEdge, quality);
        url = `data:${small.type};base64,${toBase64(small.bytes)}`;
      }
    }
    mediaUrls.set(mediaPath, url);
    return url;
  };


  const presentationXml = await read("ppt/presentation.xml");
  if (!presentationXml) throw new Error("Not a PowerPoint file");
  const presentation = parseXml(presentationXml);
  const sldSz = presentation.getElementsByTagName("p:sldSz")[0];
  const width = px(sldSz?.getAttribute("cx")) || 960;
  const height = px(sldSz?.getAttribute("cy")) || 540;

  const presRels = relTargets(await read("ppt/_rels/presentation.xml.rels"));

  // Theme colours, so scheme references resolve to the deck's real palette.
  const theme = new Map<string, string>();
  const themeTarget = Array.from(presRels.values()).find((t) => /theme\d*\.xml$/.test(t));
  if (themeTarget) {
    const themeXml = await read(resolvePath("ppt/presentation.xml", themeTarget));
    if (themeXml) {
      const scheme = parseXml(themeXml).getElementsByTagName("a:clrScheme")[0];
      for (const entry of scheme ? Array.from(scheme.children) : []) {
        const srgb = firstChild(entry, "srgbClr")?.getAttribute("val");
        const sys = firstChild(entry, "sysClr")?.getAttribute("lastClr");
        if (srgb || sys) theme.set(entry.localName!, (srgb ?? sys)!);
      }
    }
  }

  const order: string[] = [];
  for (const idEl of Array.from(presentation.getElementsByTagName("p:sldId"))) {
    const rid = idEl.getAttribute("r:id");
    const target = rid ? presRels.get(rid) : null;
    if (target) order.push(resolvePath("ppt/presentation.xml", target));
  }
  if (order.length === 0) {
    for (const path of Object.keys(zip.files)) {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) order.push(path);
    }
    order.sort(
      (a, b) => Number(a.match(/(\d+)\.xml/)?.[1] ?? 0) - Number(b.match(/(\d+)\.xml/)?.[1] ?? 0),
    );
  }

  const slides: PptxSlide[] = [];

  for (const path of order) {
    const xml = await read(path);
    if (!xml) continue;
    const doc = parseXml(xml);
    const tree = doc.getElementsByTagName("p:spTree")[0];
    if (!tree) continue;
    const rels = relTargets(await read(path.replace(/slides\//, "slides/_rels/") + ".rels"));

    // Layout, then master: placeholder geometry and background art come from here.
    const layoutTarget = Array.from(rels.values()).find((t) => /slideLayout\d*\.xml$/.test(t));
    const layoutPath = layoutTarget ? resolvePath(path, layoutTarget) : null;
    const layoutXml = layoutPath ? await read(layoutPath) : null;
    const layoutDoc = layoutXml ? parseXml(layoutXml) : null;
    const layoutRels = layoutPath
      ? relTargets(await read(layoutPath.replace(/slideLayouts\//, "slideLayouts/_rels/") + ".rels"))
      : new Map<string, string>();

    const masterTarget = Array.from(layoutRels.values()).find((t) =>
      /slideMaster\d*\.xml$/.test(t),
    );
    const masterPath = masterTarget && layoutPath ? resolvePath(layoutPath, masterTarget) : null;
    const masterXml = masterPath ? await read(masterPath) : null;
    const masterDoc = masterXml ? parseXml(masterXml) : null;
    const masterRels = masterPath
      ? relTargets(await read(masterPath.replace(/slideMasters\//, "slideMasters/_rels/") + ".rels"))
      : new Map<string, string>();

    const findPlaceholderFrame = (ph: { type: string | null; idx: string | null }) => {
      for (const source of [layoutDoc, masterDoc]) {
        if (!source) continue;
        const candidates = Array.from(source.getElementsByTagName("p:sp"))
          .map((sp) => ({ placeholder: placeholderOf(sp), frame: xfrmOf(descendant(sp, ["spPr", "xfrm"])) }))
          .filter((candidate): candidate is { placeholder: { type: string | null; idx: string | null }; frame: Frame } =>
            Boolean(candidate.placeholder && candidate.frame),
          );

        // Placeholder IDs are the only safe way to distinguish several body
        // areas on the same layout. Matching merely by type made every body
        // placeholder borrow the first body's coordinates, stacking sentences
        // on top of one another.
        if (ph.idx) {
          const exact = candidates.find((candidate) => candidate.placeholder.idx === ph.idx);
          if (exact) return exact.frame;
          continue;
        }

        const compatible = candidates.filter((candidate) =>
          ph.type
            ? candidate.placeholder.type === ph.type
            : !candidate.placeholder.type && !candidate.placeholder.idx,
        );
        // A type-only fallback is safe only when it identifies one unique box.
        if (compatible.length === 1) return compatible[0]?.frame ?? null;
      }
      return null;
    };

    const shapes: PptxShape[] = [];

    const walk = async (
      parent: Element,
      relMap: Map<string, string>,
      basePath: string,
      offsetX: number,
      offsetY: number,
      scaleX: number,
      scaleY: number,
      inheritFrames: boolean,
    ) => {
      for (const node of Array.from(parent.children)) {
        const local = node.localName;
        if (local === "sp" || local === "pic") {
          let frame = xfrmOf(descendant(node, ["spPr", "xfrm"]));
          const ph = placeholderOf(node);
          // Layout/master placeholders only carry prompt text ("Click to edit
          // Master title style"). Drawing them scribbles over the real slide.
          if (!inheritFrames && (ph || isPowerPointPrompt(node))) continue;
          if (!frame && ph && inheritFrames) frame = findPlaceholderFrame(ph);


          const spPr = firstChild(node, "spPr");
          const blip =
            descendant(node, ["blipFill", "blip"]) ??
            descendant(node, ["spPr", "blipFill", "blip"]);
          const embed = blip?.getAttribute("r:embed");
          const link = blip?.getAttribute("r:link");
          const target = embed ? relMap.get(embed) : null;
          let src: string | null = null;
          if (target) src = await mediaUrl(resolvePath(basePath, target));
          else if (link) {
            const external = relMap.get(link);
            if (external && /^https?:\/\//.test(external)) src = external;
          }

          const box = {
            x: (frame?.x ?? 0) * scaleX + offsetX,
            y: (frame?.y ?? 0) * scaleY + offsetY,
            w: (frame?.w ?? 0) * scaleX,
            h: (frame?.h ?? 0) * scaleY,
            rot: frame?.rot ?? 0,
          };

          // A plain filled/outlined shape still matters visually (cards, bars).
          const fill = fillOf(spPr, theme);
          const line = lineOf(spPr, theme);
          const geom = spPr ? firstChild(spPr, "prstGeom") : null;
          const text = textShape(node, frame, offsetX, offsetY, scaleX, scaleY, theme);

          if (src) shapes.push({ type: "image", ...box, src });
          else if (!text && (fill || line) && box.w > 0 && box.h > 0) {
            shapes.push({
              type: "shape",
              ...box,
              fill,
              line,
              radius: geom?.getAttribute("prst")?.startsWith("round") ? 8 : 0,
            });
          }
          if (text) shapes.push(text);
        } else if (local === "grpSp") {
          const grpXfrm = descendant(node, ["grpSpPr", "xfrm"]);
          const frame = xfrmOf(grpXfrm);
          const chOff = grpXfrm ? firstChild(grpXfrm, "chOff") : null;
          const chExt = grpXfrm ? firstChild(grpXfrm, "chExt") : null;
          const childW = px(chExt?.getAttribute("cx"));
          const childH = px(chExt?.getAttribute("cy"));
          // Groups scale their children: map child space onto the group box.
          const sx = childW ? (frame?.w ?? childW) / childW : 1;
          const sy = childH ? (frame?.h ?? childH) / childH : 1;
          await walk(
            node,
            relMap,
            basePath,
            offsetX + ((frame?.x ?? 0) - px(chOff?.getAttribute("x")) * sx) * scaleX,
            offsetY + ((frame?.y ?? 0) - px(chOff?.getAttribute("y")) * sy) * scaleY,
            scaleX * sx,
            scaleY * sy,
            inheritFrames,
          );
        } else if (local === "graphicFrame") {
          const frame = xfrmOf(firstChild(node, "xfrm"));
          const table = node.getElementsByTagName("a:tbl")[0];
          const picBlip = node.getElementsByTagName("a:blip")[0];
          if (table) {
            const lines = Array.from(table.getElementsByTagName("a:tr")).map((row) =>
              Array.from(row.getElementsByTagName("a:tc"))
                .map((cell) =>
                  Array.from(cell.getElementsByTagName("a:t"))
                    .map((t) => readableSymbols(t.textContent ?? ""))
                    .join(""),
                )
                .join("   |   "),
            );
            shapes.push({
              type: "text",
              x: (frame?.x ?? 0) * scaleX + offsetX,
              y: (frame?.y ?? 0) * scaleY + offsetY,
              w: (frame?.w ?? 0) * scaleX,
              h: (frame?.h ?? 0) * scaleY,
              rot: 0,
              anchor: "t",
              wrap: true,
              insets: [4, 2, 4, 2],
              fill: null,
              line: null,
              radius: 0,
              paragraphs: lines.map((line) => ({
                align: "l",
                bullet: null,
                level: 0,
                lineHeight: 1.3,
                spaceBefore: 0,
                spaceAfter: 2,
                runs: [
                  {
                    text: line,
                    size: 14 * PT_TO_PX,
                    bold: false,
                    italic: false,
                    underline: false,
                    color: null,
                    font: null,
                  },
                ],
              })),
            });
          } else if (picBlip) {
            // Charts and SmartArt often ship a rendered fallback image.
            const embed = picBlip.getAttribute("r:embed");
            const target = embed ? relMap.get(embed) : null;
            const src = target ? await mediaUrl(resolvePath(basePath, target)) : null;
            if (src) {
              shapes.push({
                type: "image",
                x: (frame?.x ?? 0) * scaleX + offsetX,
                y: (frame?.y ?? 0) * scaleY + offsetY,
                w: (frame?.w ?? 0) * scaleX,
                h: (frame?.h ?? 0) * scaleY,
                rot: 0,
                src,
              });
            }
          }
        }
      }
    };

    // Master art first, then layout art, then the slide itself.
    const showMaster = doc.documentElement.getAttribute("showMasterSp") !== "0";
    if (showMaster && masterDoc && masterPath) {
      const masterTree = masterDoc.getElementsByTagName("p:spTree")[0];
      if (masterTree) await walk(masterTree, masterRels, masterPath, 0, 0, 1, 1, false);
    }
    if (layoutDoc && layoutPath) {
      const layoutTree = layoutDoc.getElementsByTagName("p:spTree")[0];
      if (layoutTree) await walk(layoutTree, layoutRels, layoutPath, 0, 0, 1, 1, false);
    }
    await walk(tree, rels, path, 0, 0, 1, 1, true);

    const bgFill =
      fillOf(descendant(doc.documentElement, ["cSld", "bg", "bgPr"]), theme) ??
      (masterDoc
        ? fillOf(descendant(masterDoc.documentElement, ["cSld", "bg", "bgPr"]), theme)
        : null);

    const slide: PptxSlide = { shapes, background: bgFill };
    slides.push(slide);
    if (options.onSlide || options.onPartialDeck) {
      options.onSlide?.(slide, slides.length - 1, order.length);
      options.onPartialDeck?.({ width, height, slides: [...slides] });
      // Yield to the browser so the slide that just finished can paint.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (slides.length === 0) throw new Error("No slides found");
  return { width, height, slides };
}
