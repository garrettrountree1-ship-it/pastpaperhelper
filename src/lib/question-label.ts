/**
 * Past-paper questions keep their printed part labels (1(a), 1(b)(ii), 7c ...).
 * The extractor writes the label at the start of the question text, so headings
 * show the paper's own numbering instead of a running 1, 2, 3 count.
 */
const ROMAN = "i{1,3}|iv|v|vi{1,3}|ix|x";
const PART = `\\(?(?:${ROMAN}|[a-z])\\)?`;
const LABEL = new RegExp(`^\\s*\\(?(\\d{1,2})\\)?\\s*[.)]?\\s*((?:${PART}\\s*)*)`, "i");

type Parsed = { label: string; rest: string };

function parseOnce(text: string): Parsed | null {
  const match = LABEL.exec(text);
  if (!match || !match[1]) return null;
  const parts = (match[2] ?? "")
    .replace(/[()]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const label =
    parts.length > 0 ? `${match[1]}${parts.map((p) => `(${p.toLowerCase()})`).join("")}` : match[1];
  return { label, rest: text.slice(match[0].length).replace(/^[\s.):-]+/, "") };
}

export function questionLabel(questionText: string, fallbackIndex: number): string {
  const parsed = parseOnce(questionText ?? "");
  return parsed ? parsed.label : String(fallbackIndex + 1);
}

/** Strips the leading label (even when the paper repeats it) so it isn't shown twice. */
export function questionBody(questionText: string): string {
  let text = (questionText ?? "").trim();
  const first = parseOnce(text);
  if (!first) return text;
  text = first.rest;
  const again = parseOnce(text);
  if (again && again.label === first.label && again.rest) text = again.rest;
  return text.trim() || (questionText ?? "").trim();
}
