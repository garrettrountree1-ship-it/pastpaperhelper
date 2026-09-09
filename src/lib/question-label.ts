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

/** The printed main question number (the "1" in 1(b)(ii)), or null when absent. */
export function questionMainNumber(questionText: string): number | null {
  const head = HEAD.exec(questionText ?? "");
  const digits = head?.[1];
  return digits ? Number(digits) : null;
}

/** Rewrites the printed main number, keeping any part labels and wording intact. */
export function setQuestionMainNumber(questionText: string, next: number): string {
  const text = questionText ?? "";
  const safe = Math.max(1, Math.round(next));
  const head = HEAD.exec(text);
  if (head?.[1]) {
    const digits = head[1];
    return text.slice(0, head[0].length).replace(digits, String(safe)) + text.slice(head[0].length);
  }
  return `${safe} ${text.trimStart()}`;
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

/** Splits a printed label such as "12(b)(ii)" into its number and part letters. */
export function parseLabelString(label: string): { main: number | null; parts: string[] } {
  const text = (label ?? "").trim();
  const head = HEAD.exec(text);
  const main = head?.[1] ? Number(head[1]) : null;
  let rest = head ? text.slice(head[0].length) : text;
  const parts: string[] = [];
  for (;;) {
    const part = PAREN_PART.exec(rest);
    if (part?.[1]) {
      parts.push(part[1].toLowerCase());
      rest = rest.slice(part[0].length);
      continue;
    }
    const compact = COMPACT_PART.exec(rest);
    if (compact?.[1]) {
      parts.push(compact[1].toLowerCase());
      if (compact[2]) parts.push(compact[2].toLowerCase());
      rest = rest.slice(compact[0].length);
      continue;
    }
    break;
  }
  return { main, parts };
}

export function formatLabel(main: number | null, parts: string[]): string {
  return `${main ?? ""}${parts.map((p) => `(${p})`).join("")}`;
}

/** Replaces the printed label at the start of a question, keeping the wording. */
export function setQuestionLabel(questionText: string, label: string): string {
  const text = (questionText ?? "").trim();
  const parsed = parseOnce(text);
  const body = parsed ? parsed.rest : text;
  const clean = (label ?? "").trim();
  return clean ? `${clean} ${body}`.trim() : body;
}

/** Shifts a single letter part ("b" -> "d"), leaving roman numerals alone. */
export function shiftLetter(part: string, delta: number): string {
  if (!/^[a-z]$/.test(part) || delta === 0) return part;
  const next = part.charCodeAt(0) + delta;
  if (next < 97 || next > 122) return part;
  return String.fromCharCode(next);
}

const ROMANS = ["i","ii","iii","iv","v","vi","vii","viii","ix","x","xi","xii"];

/**
 * Suggests the label for a question inserted right after `label`:
 * "7" -> "8", "7(b)" -> "7(c)", "7(b)(ii)" -> "7(b)(iii)".
 */
export function nextLabelAfter(label: string): string {
  const { main, parts } = parseLabelString(label);
  if (parts.length === 0) return formatLabel((main ?? 0) + 1, []);
  const last = parts[parts.length - 1] ?? "";
  const rest = parts.slice(0, -1);
  const romanAt = ROMANS.indexOf(last.toLowerCase());
  if (romanAt !== -1 && romanAt + 1 < ROMANS.length) {
    return formatLabel(main, [...rest, ROMANS[romanAt + 1] as string]);
  }
  if (/^[a-z]$/.test(last)) return formatLabel(main, [...rest, shiftLetter(last, 1)]);
  if (/^\d+$/.test(last)) return formatLabel(main, [...rest, String(Number(last) + 1)]);
  return formatLabel(main, parts);
}
