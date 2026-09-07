/**
 * Shared "prepare once" pipeline for slide decks and Word documents.
 *
 * The expensive part of opening a .pptx/.docx in the browser is unzipping it and
 * rebuilding every shape. Doing that on each open (per person, per device) is
 * what made resources feel slow. Instead the teacher's browser prepares the
 * render as soon as the file is uploaded and stores the finished render next to
 * the original file, so every later viewer — teacher or student — downloads a
 * ready-made render and shows it immediately.
 */
import { createMaterialRenderUpload, getMaterialRenderUrl } from "@/lib/materials.functions";
import { parsePptx, type PptxDeck, type PptxParseOptions } from "@/lib/pptx-render";
import { supabase } from "@/integrations/supabase/client";

export type OfficeRender = { format: "pptx"; deck: PptxDeck } | { format: "docx"; html: string };

/**
 * Bumped whenever the reader changes how a file is turned into a render, so
 * stored renders built by an older reader are rebuilt instead of reused.
 */
const RENDER_VERSION = 4;

/** Builds the render from the raw file bytes, in the browser. */
export async function buildOfficeRender(
  buffer: ArrayBuffer,
  format: "pptx" | "docx",
  options: PptxParseOptions = {},
): Promise<OfficeRender> {
  if (format === "docx") {
    const mammoth = await import("mammoth/mammoth.browser.js");
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    return { format: "docx", html: result.value };
  }
  return { format: "pptx", deck: await parsePptx(buffer, options) };
}

/** Downloads a previously prepared render, if one has been stored. */
export async function fetchSharedRender(materialId: string): Promise<OfficeRender | null> {
  try {
    const { url } = await getMaterialRenderUrl({ data: { materialId } });
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = (await response.json()) as OfficeRender & { renderVersion?: number };
    if ((payload?.renderVersion ?? 1) !== RENDER_VERSION) return null;
    if (payload?.format === "pptx" && payload.deck?.slides?.length) return payload;
    if (payload?.format === "docx" && typeof payload.html === "string") return payload;
    return null;
  } catch {
    return null;
  }
}

/** Stores a render so nobody has to build it again. Teachers only; failures are silent. */
export async function saveSharedRender(materialId: string, render: OfficeRender): Promise<boolean> {
  try {
    const { path, token } = await createMaterialRenderUpload({ data: { materialId } });
    const blob = new Blob([JSON.stringify({ ...render, renderVersion: RENDER_VERSION })], { type: "application/json" });
    const { error } = await supabase.storage
      .from("class-materials")
      .uploadToSignedUrl(path, token, blob, { contentType: "application/json", upsert: true });
    return !error;
  } catch {
    return false;
  }
}

/** Called right after an upload: prepare the render in the background. */
export async function prerenderUploadedMaterial(
  materialId: string,
  file: File,
  format: "pptx" | "docx",
): Promise<void> {
  const buffer = await file.arrayBuffer();
  const render = await buildOfficeRender(buffer, format);
  await saveSharedRender(materialId, render);
}
