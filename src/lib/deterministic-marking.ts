import type { MarkResult } from "./marking.server";

const CHOICE_TOKEN =
  /(?:^|\b(?:answer|option)\s*[:=]?\s*|\b\d{1,3}\s*[=:]\s*)([a-e])(?:\b|\s*[).])/i;
const NUMBER_TOKEN =
  /[-+]?(?:(?:\d{1,3}(?:,\d{3})+)|\d+|\.\d+)(?:\.\d+)?(?:\s*(?:[eE]|[×x]\s*10\s*\^?)\s*[-+]?\d+)?/g;

export function extractChoiceAnswer(text: string | null | undefined): string | null {
  const compact = (text ?? "").replace(/\s+/g, " ").trim();
  const match = CHOICE_TOKEN.exec(compact);
  return match?.[1]?.toUpperCase() ?? null;
}

/** Extract the final printed number. Teachers see and can correct this value before publishing. */
export function extractFinalNumber(text: string | null | undefined): string | null {
  const withoutMarks = (text ?? "")
    .replace(/\b[AMB]\s*\d+\b/gi, "")
    .replace(/\(?\b\d+(?:\.\d+)?\s*marks?\b\)?/gi, "")
    .replace(/[⁻⁺]/g, (value) => (value === "⁻" ? "-" : "+"))
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (value) => "0123456789"["⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(value)]!);
  const matches = [...withoutMarks.matchAll(NUMBER_TOKEN)];
  return matches.at(-1)?.[0]?.trim() ?? null;
}

export function looksNumericalQuestion(question: string, markScheme: string): boolean {
  if (!/\b(calculate|work out|determine|find|evaluate|how (?:many|much)|value)\b/i.test(question)) {
    return false;
  }
  return extractFinalNumber(markScheme) !== null;
}

function parseNumber(value: string): number | null {
  const normal = value
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/[×x]10\^?/i, "e");
  const parsed = Number(normal);
  return Number.isFinite(parsed) ? parsed : null;
}

function finalStudentNumber(answer: string): string | null {
  return extractFinalNumber(answer);
}

function deterministicResult(correct: boolean, marks: number): MarkResult {
  return {
    verdict: correct ? "correct" : "incorrect",
    awardedMarks: correct ? marks : 0,
    feedback: correct ? "Well done — your answer earns full marks." : "Incorrect.",
    explanation: "",
    leadingQuestion: "",
    markPoints: [],
  };
}

export function markTypedChoice(
  answer: string,
  expected: string,
  marks: number,
): MarkResult | null {
  const submitted = extractChoiceAnswer(answer);
  const official = extractChoiceAnswer(expected);
  if (!submitted || !official) return null;
  return deterministicResult(submitted === official, marks);
}

export function markTypedFinalNumber(
  answer: string,
  expected: string,
  marks: number,
): MarkResult | null {
  const submittedToken = finalStudentNumber(answer);
  const expectedToken = finalStudentNumber(expected);
  if (!submittedToken || !expectedToken) return null;
  const submitted = parseNumber(submittedToken);
  const official = parseNumber(expectedToken);
  if (submitted === null || official === null) return null;
  // A tiny floating-point allowance makes equivalent scientific notation safe
  // without accepting materially different rounded answers.
  const tolerance = Math.max(1e-12, Math.abs(official) * 1e-12);
  return deterministicResult(Math.abs(submitted - official) <= tolerance, marks);
}
