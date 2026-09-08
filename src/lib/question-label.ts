import { cleanMathText } from "@/lib/math-text";

/**
 * Past-paper questions keep their printed part labels (1(a), 1(b)(ii), 7c ...).
 * The extractor writes the label at the start of the question text, so headings
 * show the paper's own numbering instead of a running 1, 2, 3 count.
 */
const ROMAN = "i{1,3}|iv|v|vi{1,3}|ix|x";
const HEAD = new RegExp(`^\\s*\\(?(\\d{1,3})\\)?\\s*[.)]?\\s*`, "i");
const PAREN_PART = new RegExp(`^\\s*\\(\\s*(${ROMAN}|[a-z])\\s*\\)`, "i");
const COMPACT_PART = new RegExp(
  `^\\s*([a-z])(?:\\s*\\(?(${ROMAN})\\)?)?(?=\\s|[.):-]|$)`,
  "i",
);

type Parsed = { label: string; rest: string };

function parseOnce(text: string): Parsed | null {
  const head = HEAD.exec(text);
  if (!head || !head[1]) return null;
  const parts: string[] = [];
  let rest = text.slice(head[0].length);
  for (;;) {
    const part = PAREN_PART.exec(rest);
    if (!part) break;
    const value = part[1];
    if (value) parts.push(value.toLowerCase());
    rest = rest.slice(part[0].length);
  }
  if (parts.length === 0) {
    const compact = COMPACT_PART.exec(rest);
    const letter = compact?.[1];
    if (compact && letter) {
      parts.push(letter.toLowerCase());
      const roman = compact[2];
      if (roman) parts.push(roman.toLowerCase());
      rest = rest.slice(compact[0].length);
    }
  }
  const label = `${head[1]}${parts.map((p) => `(${p})`).join("")}`;
  return { label, rest: rest.replace(/^[\s.):-]+/, "") };
}

export function questionLabel(questionText: string, fallbackIndex: number): string {
  const parsed = parseOnce(questionText ?? "");
  return parsed ? parsed.label : String(fallbackIndex + 1);
}

/** Strips the leading label (even when the paper repeats it) so it isn't shown twice. */
export function questionBody(questionText: string): string {
  let text = cleanMathText((questionText ?? "").trim());
  const first = parseOnce(text);
  if (!first) return text;
  text = first.rest;
  const again = parseOnce(text);
  if (again && again.label === first.label && again.rest) text = again.rest;
  return text.trim() || cleanMathText((questionText ?? "").trim());
}
