import { cleanMathText } from "@/lib/math-text";

/**
 * Past-paper questions keep their printed part labels (1(a), 1(b)(ii), 7c ...).
 * The extractor writes the label at the start of the question text, so headings
 * show the paper's own numbering instead of a running 1, 2, 3 count.
 */
const ROMAN = "i{1,3}|iv|v|vi{1,3}|ix|x";
const HEAD = new RegExp(`^\\s*\\(?(\\d{1,3})\\)?\\s*[.)]?\\s*`, "i");
const PAREN_PART = new RegExp(
  `^\\s*\\(\\s*(${ROMAN}|[a-z](?:[.]?(?:${ROMAN}))?)\\s*\\)`,
  "i",
);
const COMPACT_PART = new RegExp(`^\\s*([a-z])(?:\\s*\\(?(${ROMAN})\\)?)?(?=\\s|[.):-]|$)`, "i");

type Parsed = { label: string; rest: string };

/** Papers (and re-labelling) sometimes repeat a part: "13(g) (g) State ..." -> one (g). */
function dropRepeats(parts: string[]): string[] {
  const adjacent = parts.filter((part, index) => index === 0 || part !== parts[index - 1]);
  if (adjacent.length % 2 === 0) {
    const middle = adjacent.length / 2;
    if (adjacent.slice(0, middle).join(".") === adjacent.slice(middle).join(".")) {
      return adjacent.slice(0, middle);
    }
  }
  return adjacent;
}

/** Split compact printed parts such as "aii" into letter "a" + roman "ii". */
function tokenParts(token: string): string[] {
  const value = token.toLowerCase().replace(/[.]/g, "");
  if (new RegExp(`^(?:${ROMAN})$`, "i").test(value)) return [value];
  const compact = new RegExp(`^([a-z])(${ROMAN})$`, "i").exec(value);
  return compact?.[1] && compact[2] ? [compact[1], compact[2]] : [value];
}

/**
 * Older extractions sometimes stored a running position before the real
 * sub-part, for example `6 (b.ii) ...` or `5 ...\n(a.ii) ...`. Recover that
 * printed part so an entire assignment can still display as 5(a)(ii),
 * 5(b)(i), 5(b)(ii), then 6.
 */
function embeddedParts(questionText: string): string[] {
  const parsed = parseOnce(questionText ?? "");
  if (!parsed) return [];
  const existing = parseLabelString(parsed.label).parts;
  const body = parsed.rest;
  const match = new RegExp(
    `(?:^|\\n)\\s*\\(\\s*([a-z])(?:[.]?\\s*\\(?(${ROMAN})\\)?)?\\s*\\)(?=\\s|[.):-]|$)`,
    "im",
  ).exec(body);
  if (!match?.[1]) return existing;
  const found = tokenParts(`${match[1]}${match[2] ?? ""}`);
  return existing.length > 0 ? existing : found;
}

/** Match compact labels printed on papers: 1(ai), 1(aii), 1(biii). */
function displayParts(parts: string[]): string {
  const output: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!;
    const next = parts[index + 1];
    if (/^[a-z]$/.test(part) && next && new RegExp(`^(?:${ROMAN})$`, "i").test(next)) {
      output.push(`(${part}${next})`);
      index += 1;
    } else output.push(`(${part})`);
  }
  return output.join("");
}

function parseOnce(text: string): Parsed | null {
  const head = HEAD.exec(text);
  if (!head || !head[1]) return null;
  const parts: string[] = [];
  let rest = text.slice(head[0].length);
  for (;;) {
    const part = PAREN_PART.exec(rest);
    if (!part) break;
    const value = part[1];
    if (value) parts.push(...tokenParts(value));
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
  const label = `${head[1]}${displayParts(dropRepeats(parts))}`;
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
      parts.push(...tokenParts(part[1]));
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
  return { main, parts: dropRepeats(parts) };
}

export function formatLabel(main: number | null, parts: string[]): string {
  return `${main ?? ""}${displayParts(parts)}`;
}

/** Replaces the printed label at the start of a question, keeping the wording. */
export function setQuestionLabel(questionText: string, label: string): string {
  const text = (questionText ?? "").trim();
  const parsed = parseOnce(text);
  let body = parsed ? parsed.rest : text;
  const clean = (label ?? "").trim();
  if (!clean) return body;
  // Never repeat the label's last part when the wording already starts with it.
  const { parts } = parseLabelString(clean);
  const last = parts[parts.length - 1];
  if (last) {
    const repeat = new RegExp(`^\\s*\\(?\\s*${last}\\s*\\)?\\s*[.:-]?\\s*`, "i");
    const stripped = body.replace(repeat, "");
    if (stripped !== body && stripped.trim()) body = stripped;
  }
  return `${clean} ${body}`.trim();
}

/** Shifts a single letter part ("b" -> "d"), leaving roman numerals alone. */
export function shiftLetter(part: string, delta: number): string {
  if (!/^[a-z]$/.test(part) || delta === 0) return part;
  const next = part.charCodeAt(0) + delta;
  if (next < 97 || next > 122) return part;
  return String.fromCharCode(next);
}

const ROMANS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];

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

/** The label printed on the paper, or null when the wording carries none. */
export function printedLabel(questionText: string): string | null {
  return parseOnce(questionText ?? "")?.label ?? null;
}

/** Part labels printed without their main number: "(b)", "b)", "(ii)". */
function leadingPartsOnly(questionText: string): string[] {
  let rest = (questionText ?? "").trim();
  const parts: string[] = [];
  for (;;) {
    const paren = PAREN_PART.exec(rest);
    if (paren?.[1]) {
      parts.push(...tokenParts(paren[1]));
      rest = rest.slice(paren[0].length);
      continue;
    }
    if (parts.length === 0) {
      const compact = /^\s*([a-z])\s*\)/i.exec(rest);
      if (compact?.[1]) {
        parts.push(compact[1].toLowerCase());
        rest = rest.slice(compact[0].length);
        continue;
      }
    }
    break;
  }
  return dropRepeats(parts);
}

/**
 * Works out the label of every question in a paper, in order. Printed labels
 * win. A question without one continues the paper's own numbering: a part-only
 * label such as "(c)" keeps the previous main number, and wording with no label
 * at all follows on from the question above it (1(b) -> 1(c), 4 -> 5).
 */
export function resolveQuestionLabels(questionTexts: string[]): string[] {
  const labels: string[] = [];
  let previous: string | null = null;
  questionTexts.forEach((text, index) => {
    const printed = printedLabel(text);
    const printedParts = printed ? parseLabelString(printed).parts : [];
    const recoveredParts = printedParts.length > 0 ? printedParts : embeddedParts(text);
    if (recoveredParts.length > 0) {
      const printedMain = printed ? parseLabelString(printed).main : null;
      const previousParsed = previous ? parseLabelString(previous) : null;
      const bodyAfterPrinted = parseOnce(text)?.rest ?? "";
      const repeatedPart = leadingPartsOnly(bodyAfterPrinted);
      const legacyRunningPrefix =
        printedParts.length > 0 &&
        previousParsed?.parts.length &&
        printedMain !== null &&
        previousParsed.main !== null &&
        (repeatedPart.join(".") === printedParts.join(".") ||
          printedMain > previousParsed.main + 1);
      const main =
        legacyRunningPrefix
          ? previousParsed.main
          : printedParts.length > 0
          ? printedMain
          : previousParsed?.parts.length
            ? previousParsed.main
            : (printedMain ?? (previousParsed?.main ?? index) + 1);
      const label = formatLabel(main, recoveredParts);
      labels.push(label);
      previous = label;
      return;
    }
    if (printed) {
      const printedMain = parseLabelString(printed).main;
      const previousParsed = previous ? parseLabelString(previous) : null;
      const label =
        previousParsed?.parts.length && previousParsed.main !== null
          ? formatLabel(previousParsed.main + 1, [])
          : formatLabel(printedMain, []);
      labels.push(label);
      previous = label;
      return;
    }
    const parts = leadingPartsOnly(text);
    const previousMain = previous ? parseLabelString(previous).main : null;
    if (parts.length > 0 && previousMain !== null) {
      const label = formatLabel(previousMain, parts);
      labels.push(label);
      previous = label;
      return;
    }
    const label = previous ? nextLabelAfter(previous) : String(index + 1);
    labels.push(label);
    previous = label;
  });
  return labels;
}
