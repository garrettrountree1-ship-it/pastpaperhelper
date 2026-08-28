/**
 * Minimal, dependable .pptx reader: turns a deck into positioned text and image
 * boxes per slide so slides can be rendered as plain scrollable HTML pages.
 */
const EMU_PER_PX = 9525;

export type PptxRun = {
  text: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string | null;
};

export type PptxShape =
  | {
      type: "text";
      x: number;
      y: number;
      w: number;
      h: number;
      rot: number;
      paragraphs: { align: string; bullet: boolean; runs: PptxRun[] }[];
    }
  | { type: "image"; x: number; y: number; w: number; h: number; rot: number; src: string };

export type PptxSlide = { shapes: PptxShape[] };
export type PptxDeck = { width: number; height: number; slides: PptxSlide[] };

const px = (emu: string | null | undefined) => (emu ? Number(emu) / EMU_PER_PX : 0);

function firstChild(parent: Element, localName: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) return child;
  }
  return null;
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

function xfrmOf(node: Element | null) {
  if (!node) return null;
  const off = firstChild(node, "off");
  const ext = firstChild(node, "ext");
  return {
    x: px(off?.getAttribute("x")),
    y: px(off?.getAttribute("y")),
    w: px(ext?.getAttribute("cx")),
    h: px(ext?.getAttribute("cy")),
    rot: Number(node.getAttribute("rot") ?? 0) / 60000,
  };
}

function textShape(sp: Element, offsetX: number, offsetY: number): PptxShape | null {
  const body = firstChild(sp, "txBody");
  if (!body) return null;
  const frame = xfrmOf(descendant(sp, ["spPr", "xfrm"]));

  const paragraphs: { align: string; bullet: boolean; runs: PptxRun[] }[] = [];
  for (const p of Array.from(body.children).filter((c) => c.localName === "p")) {
    const pPr = firstChild(p, "pPr");
    const runs: PptxRun[] = [];
    for (const child of Array.from(p.children)) {
      if (child.localName !== "r") continue;
      const rPr = firstChild(child, "rPr");
      const colorEl = rPr ? descendant(rPr, ["solidFill", "srgbClr"]) : null;
      runs.push({
        text: firstChild(child, "t")?.textContent ?? "",
        size: Number(rPr?.getAttribute("sz") ?? 1800) / 100,
        bold: rPr?.getAttribute("b") === "1",
        italic: rPr?.getAttribute("i") === "1",
        underline: Boolean(rPr?.getAttribute("u") && rPr.getAttribute("u") !== "none"),
        color: colorEl?.getAttribute("val") ? `#${colorEl.getAttribute("val")}` : null,
      });
    }
    if (runs.length === 0 && paragraphs.length === 0) continue;
    paragraphs.push({
      align: pPr?.getAttribute("algn") ?? "l",
      bullet: Boolean(pPr && firstChild(pPr, "buChar")),
      runs,
    });
  }
  if (paragraphs.every((p) => p.runs.every((r) => !r.text.trim()))) return null;

  return {
    type: "text",
    x: (frame?.x ?? 0) + offsetX,
    y: (frame?.y ?? 0) + offsetY,
    w: frame?.w ?? 0,
    h: frame?.h ?? 0,
    rot: frame?.rot ?? 0,
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
  // TIFF, EMF and WMF cannot be displayed by browsers at all.
  if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) return null;
  if (b[0] === 0x01 && b[1] === 0x00 && b[2] === 0x00 && b[3] === 0x00) return null;
  if (b[0] === 0xd7 && b[1] === 0xcd) return null;
  if (ext === "svg") return "image/svg+xml";
  if (ext === "png" || ext === "gif" || ext === "bmp" || ext === "webp") return `image/${ext}`;
  if (ext === "jpg" || ext === "jpeg" || ext === "jfif") return "image/jpeg";
  return null;
}

export async function parsePptx(buffer: ArrayBuffer): Promise<PptxDeck> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  const read = async (path: string) => {
    const file = zip.file(path);
    return file ? await file.async("text") : null;
  };

  /** Media entries are shared between slides, so build each object URL only once. */
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
        url = URL.createObjectURL(
          new Blob([bytes.slice().buffer as ArrayBuffer], { type }),
        );
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
    const shapes: PptxShape[] = [];

    const walk = async (parent: Element, offsetX: number, offsetY: number) => {
      for (const node of Array.from(parent.children)) {
        if (node.localName === "sp" || node.localName === "pic") {
          const shape = textShape(node, offsetX, offsetY);
          if (shape) shapes.push(shape);
          const frame = xfrmOf(descendant(node, ["spPr", "xfrm"]));
          // Pictures use p:blipFill; ordinary shapes can also be filled with an image.
          const blip =
            descendant(node, ["blipFill", "blip"]) ??
            descendant(node, ["spPr", "blipFill", "blip"]);
          const embed = blip?.getAttribute("r:embed");
          const link = blip?.getAttribute("r:link");
          const target = embed ? rels.get(embed) : null;
          let src: string | null = null;
          if (target) src = await mediaUrl(resolvePath(path, target));
          else if (link) {
            const external = rels.get(link);
            if (external && /^https?:\/\//.test(external)) src = external;
          }
          if (!src) continue;
          shapes.push({
            type: "image",
            x: (frame?.x ?? 0) + offsetX,
            y: (frame?.y ?? 0) + offsetY,
            w: frame?.w ?? 0,
            h: frame?.h ?? 0,
            rot: frame?.rot ?? 0,
            src,
          });
        } else if (node.localName === "grpSp") {
          const frame = xfrmOf(descendant(node, ["grpSpPr", "xfrm"]));
          await walk(node, offsetX + (frame?.x ?? 0), offsetY + (frame?.y ?? 0));
        } else if (node.localName === "graphicFrame") {
          const frame = xfrmOf(firstChild(node, "xfrm"));
          const table = node.getElementsByTagName("a:tbl")[0];
          if (!table) continue;
          const lines = Array.from(table.getElementsByTagName("a:tr")).map((row) =>
            Array.from(row.getElementsByTagName("a:tc"))
              .map((cell) =>
                Array.from(cell.getElementsByTagName("a:t"))
                  .map((t) => t.textContent ?? "")
                  .join(""),
              )
              .join("   |   "),
          );
          shapes.push({
            type: "text",
            x: (frame?.x ?? 0) + offsetX,
            y: (frame?.y ?? 0) + offsetY,
            w: frame?.w ?? 0,
            h: frame?.h ?? 0,
            rot: 0,
            paragraphs: lines.map((line) => ({
              align: "l",
              bullet: false,
              runs: [
                { text: line, size: 14, bold: false, italic: false, underline: false, color: null },
              ],
            })),
          });
        }
      }
    };

    await walk(tree, 0, 0);
    slides.push({ shapes });
  }

  if (slides.length === 0) throw new Error("No slides found");
  return { width, height, slides };
}
