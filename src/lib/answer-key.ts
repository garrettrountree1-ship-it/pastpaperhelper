/**
 * Tells apart a page of questions from a page of answers.
 *
 * Teachers upload a mixture: sometimes one file holds the questions and the
 * answers, sometimes the answers (or mark scheme) come as a separate file. The
 * students must never be shown the answer pages, so any picture whose own name
 * reads like an answer key is left out of the student view.
 */

const ANSWER_WORDS = [
  "answer",
  "answers",
  "answerkey",
  "answer-key",
  "answer key",
  "mark scheme",
  "markscheme",
  "mark-scheme",
  "marking scheme",
  "marking guide",
  "examiner report",
  "examiners report",
  "solution",
  "solutions",
  "worked example",
  "model answer",
  "memo",
  "rubric",
];

/** True when this page picture looks like it comes from an answer key. */
export function looksLikeAnswerKey(url: string) {
  const path = decodeURIComponent((url.split("?")[0] ?? url).toLowerCase());
  const name = path.split("/").pop() ?? path;
  const spaced = name.replace(/[_+]+/g, " ");
  if (ANSWER_WORDS.some((word) => spaced.includes(word))) return true;
  // Common shorthand: "…-ms.pdf", "paper 4 ms page 2", "qp" is questions, "ms" is the scheme.
  if (/(^|[^a-z])ms([^a-z]|$)/.test(spaced)) return true;
  if (/(^|[^a-z])mark?sch([^a-z]|$)/.test(spaced)) return true;
  return false;
}

/** Keeps only the pictures a student may see. */
export function questionPagesOnly(urls: string[]) {
  const safe = urls.filter((url) => !looksLikeAnswerKey(url));
  // If everything looked like an answer key the teacher probably named the whole
  // file that way, so fall back to showing what there is rather than nothing.
  return safe.length > 0 ? safe : urls;
}
