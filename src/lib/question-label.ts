/**
 * Past-paper questions keep their printed part labels (1(a), 1(b)(ii), 7c ...).
 * The extractor writes the label at the start of the question text, so headings
 * show the paper's own numbering instead of a running 1, 2, 3 count.
 */
const LABEL = /^\s*\(?(\d{1,2})\)?\s*[.)]?\s*((?:\(?[a-z]\)?|\(?(?:i{1,3}|iv|v|vi{0,3}|ix|x)\)?)(?:\s*\(?(?:i{1,3}|iv|v|vi{0,3}|ix|x|[a-z])\)?)*)?/i;

export function questionLabel(questionText: string, fallbackIndex: number): string {
  const match = LABEL.exec(questionText ?? "");
  if (!match || !match[1]) return String(fallbackIndex + 1);
  const number = match[1];
  const parts = (match[2] ?? "")
    .replace(/[()\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length > 0 ? `${number}${parts.map((p) => `(${p})`).join("")}` : number;
}

/** Strips the leading label so it isn't shown twice next to the heading. */
export function questionBody(questionText: string): string {
  const text = (questionText ?? "").trimStart();
  const label = questionLabel(text, -1);
  if (label === "0") return text;
  const stripped = text.replace(
    new RegExp(`^\\(?${label.replace(/[().]/g, "\\$&").replace(/\\\(/g, "[( ]?").replace(/\\\)/g, "[) ]?")}\\)?[.)\\s:-]*`, "i"),
    "",
  );
  return stripped.trim() || text;
}
