/** Which viewer can render a given uploaded file, based on its extension. */
export type DocFormat = "pdf" | "pptx" | "docx" | "legacy" | "other";

export function docFormat(source?: string | null): DocFormat {
  const name = (source ?? "").toLowerCase().split("?")[0] ?? "";
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".pptx")) return "pptx";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".ppt") || name.endsWith(".doc") || name.endsWith(".key")) return "legacy";
  return "other";
}
