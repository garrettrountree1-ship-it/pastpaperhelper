import { unzipSync } from "fflate";
import { cleanMathText } from "@/lib/math-text";
import { extractChoiceAnswer, looksNumericalQuestion } from "@/lib/deterministic-marking";

import { aiApiKey, postChatCompletion } from "./ai-gateway.server";

export type QuestionCrop = {
  /** Which upload the page belongs to: the paper, or the mark scheme/answer file. */
  sheet?: "paper" | "answer";
  /** 1-based page number the snip is taken from. */
  page: number;
  /** Top / bottom of the snip as a fraction (0-1) of that page's height. */
  top: number;
  bottom: number;
};

export type ExtractedQuestion = {
  questionText: string;
  markScheme: string;
  marks: number;
  /** OCR-derived fast-check answer. It is always shown to the teacher for verification. */
  expectedAnswer?: string;
  numericalAnswer?: boolean;
  /** 1-based page numbers of the uploaded paper this part appears on. */
  pages: number[];
  /** Region(s) of the page(s) to show the student, in reading order. */
  crops?: QuestionCrop[] | null;
  /** Region(s) showing the official answer / mark scheme, as printed. */
  answerCrops?: QuestionCrop[] | null;
};

/** Questions plus non-destructive notes for the teacher to review before publishing. */
export type ExtractionResult = {
  questions: ExtractedQuestion[];
  warnings: string[];
};

export type UploadedFile = {
  filename: string;
  mimeType: string;
  base64: string;
  /** Browser-measured non-white row ranges for rejecting blank crop guesses. */
  inkBands?: Array<[number, number]> | undefined;
};

type ExtractInput = {
  curriculum: string;
  subject: string;
  paperFiles: UploadedFile[];
  markSchemeFiles: UploadedFile[];
};

type InventoryItem = {
  /** Unique request key. Printed labels can restart or repeat in compilations. */
  key: string;
  label: string;
  marks: number;
  pages: number[];
  kind?: string;
};

const BATCH_SIZE = 6;
const MAX_ITEMS = 300;

const SHARED_RULES = [
  "You digitise IGCSE, A-Level and IB past papers into homework questions.",
  "The upload is often NOT a clean official paper: teachers paste questions and mark schemes together from several different papers into a Word document or PDF, in any order, with inconsistent numbering, duplicated numbers, missing numbers, stray headings, tables and screenshots.",
  "Papers mix question types freely: multiple choice (A/B/C/D), short answer, calculations, diagram/drawing tasks and extended writing. Treat every one of them as a question.",
  "Every answerable sub-part is its own item: 1(a), 1(b)(i), 1(b)(ii), 2(a) ... Never merge sub-parts and never summarise a paper down to a few sample questions.",
  "The printed MAIN NUMBER controls grouping. Start a new main question whenever a new printed number appears. Until the next number, attach standalone letters and roman numerals to that number: a, b, c, d; i, ii, iii; ai, aii, aiii; (a)(i), (a)(ii), (a)(iii). Never promote a sub-part to a new main number.",
  'Sub-part labels are printed in many styles and ALL of them count as their own part: (a), a), a., (i), (ii), (a)(i), (a.i), (a.ii), (b.iii), c.i, ai, aii, bi, bii. A label such as "(a.ii)" or "(b)" standing alone on its own line is a real sub-part even when its parent number is printed pages earlier.',
  "Work through the documents page by page, in order, from the first question to the very last one, including anything that appears after a mark scheme block or between mark scheme blocks.",
  "In teacher-made documents each sub-part is usually followed immediately by its own mark scheme block, then the NEXT sub-part continues below or on the following page. Always keep reading past every mark scheme block: the parts printed after it are still questions and are the ones most often missed.",
  "Before you finish, walk the sub-part letters and roman numerals of every question in order and check none is absent: if you have (a) and (a)(i) and (b), make sure (a)(ii) is not printed somewhere between them. A gap in the sequence means you missed a part — go back and find it.",
  "Never skip a question because it looks out of place, unnumbered, repeated, or because its numbering clashes with an earlier one.",
].join(" ");

const INVENTORY_SYSTEM = [
  SHARED_RULES,
  "Task: produce a COMPLETE index of every answerable question part in the upload.",
  "Give every item a unique extractionKey in reading order: q001, q002, q003, and so on. extractionKey is only an internal locator; label remains the label printed beside that question.",
  "Do not write the question wording or the answers here — only the part label, its marks and its type.",
  'Use the printed label exactly where one exists, e.g. "1(a)", "1(b)(ii)", "3", "7(c)".',
  'When numbering is missing, use a short descriptive label such as "unnumbered". Printed labels MAY repeat or restart in a teacher compilation; keep the printed label and use extractionKey to distinguish each occurrence. Never discard an item because its label was already used.',
  "If a question has no sub-parts, list the question number alone.",
  "Include every part: multiple choice items, one-mark recall items, calculations, diagram/graph tasks and extended-writing tasks.",
  'kind: "mcq" for multiple-choice items with printed options, otherwise "short".',
  "Anything that is only a mark scheme / answer block for a question you have already indexed is NOT a new item.",
  "Each paper page is supplied as an image labelled PAGE 1, PAGE 2, ... Record which page(s) each part appears on, including a page that only holds its figure, diagram, graph or table.",
  'Reply with JSON only: {"items":[{"extractionKey":"q001","label":"1(a)","marks":2,"kind":"short","pages":[3]}]}',
].join(" ");

const SWEEP_SYSTEM = [
  SHARED_RULES,
  "Task: a first pass already indexed some question parts. Find the ones it MISSED.",
  "You are given the labels already found. Scan the whole upload again and list only answerable question parts that are not already covered.",
  "The same printed label can belong to several different questions. Compare the page and surrounding wording, not the label alone.",
  "Pay special attention to multiple-choice blocks, questions pasted mid-document, questions after a mark scheme section, and unnumbered questions.",
  'Above all, check for MISSING SUB-PARTS: for each question already indexed, read every page it touches and the pages after it and list any (a)/(b)/(c) or (i)/(ii)/(iii) part — including forms like (a.ii) or (b) alone on a line, and parts printed after a mark scheme block — that is not already in the list. Use the printed label for these, e.g. "1(a)(ii)", not an invented one.',
  "Give each missed item a new unique extractionKey continuing the supplied sequence. Keep its printed label even when that label repeats.",
  "If nothing was missed, reply with an empty items array.",
  'Reply with JSON only: {"items":[{"extractionKey":"q017","label":"2","marks":1,"kind":"mcq","pages":[5]}]}',
].join(" ");

const DETAIL_SYSTEM = [
  SHARED_RULES,
  "Task: for ONLY the requested part labels, transcribe the question and align the official mark scheme.",
  "Return the extractionKey supplied for every requested item. It distinguishes separate questions whose printed numbers repeat or restart.",
  "questionText: start with the part label, then reproduce the printed wording CHARACTER FOR CHARACTER. You are an OCR transcriber, not an editor or a rewriter.",
  "For multiple-choice questions, transcribe the stem AND every printed option on its own line, keeping the printed option letters/numbers (A, B, C, D). Never drop, reorder or reword options.",
  'ABSOLUTE RULE: never change, modernise, simplify, translate, correct, shorten, expand or reorder ANY word of the question. Do not swap a word for a synonym (no "work out" for "calculate", no "find" for "determine", no "picture" for "Fig."). Do not fix the paper\'s spelling, capitalisation, punctuation, spacing or British/American usage. Do not add words such as "the", "your" or "please" that are not printed, and do not drop printed words.',
  'Keep the printed line structure, bracketed instructions, blank-line dots and "[2]" style mark tags out of the wording only if they are page furniture; everything the student reads stays exactly as printed.',
  "If part of the wording is unreadable in the scan, transcribe what is legible and put [unclear] at that spot — never guess or paraphrase a replacement.",
  'NEVER describe or re-draw a figure, diagram, graph, table, circuit or chemical structure in words: the original paper page image is attached to the question for the student to look at. Instead transcribe the wording and refer to it as printed (e.g. "Fig. 2.1").',
  "Equations, formulae and expressions must be transcribed exactly as printed, keeping symbols, indices, fractions and units.",
  "NEVER use LaTeX or markdown: no $ or $$ delimiters, no \\\\frac, \\\\text, \\\\times, ^{ }, _{ }, no ** bold. Write maths in plain text with real Unicode characters instead — nuclide symbols as ²³⁵₉₂U, indices as m², formulae as H₂O, and fractions as (y - b)/m, with °C, °F, ×, ÷, ≤, ≥, ≈, →, π, Δ, Ω, µ, ± typed directly.",
  "markScheme: the official marking points for that exact part, verbatim where possible, with accepted alternatives and mark allocation. The mark scheme may sit far away from the question in the upload, or immediately under it — search the whole document for it.",
  'For multiple choice, the mark scheme is the correct option letter plus a one-line reason, e.g. "C (1 mark) — ...".',
  "expectedAnswer: for multiple choice, return only its correct option letter. For a calculation, read the marking logic and return the actual final result that answers the question, exactly as printed, including its sign, scientific notation and unit. Do NOT take the last number in the block: ignore question labels, mark totals, M1/A1/B1 codes, precision instructions and intermediate working. Otherwise return an empty string. numericalAnswer: true only when expectedAnswer is a calculation result. These fields are shown to the teacher for verification and used for fast code checking.",
  "If no mark scheme is supplied anywhere for that part, write a concise expected answer with marking points instead.",
  "marks: the integer marks for that part (default 1).",
  "Return one item per requested label, in the same order, and never skip a label.",
  'crops: the band(s) of the page picture(s) that must be shown to the student for this part, so nothing printed is lost. Give a list: [{"page":N,"top":T,"bottom":B}] where T and B are fractions of that page\'s full height measured from the top of the page (0 = very top, 1 = very bottom).',
  "When the part runs over a page break — for example the wording is at the foot of one page and its options, table or diagram continue at the top of the next — give TWO bands in reading order: the tail of the first page, then the head of the next page. Never drop the continuation and never set crops to null just because it spans pages.",
  "Boundaries: a band starts at this part's own printed label and stops immediately BEFORE the next printed question or part label (the next number, the next (a)/(b), the next (i)/(ii)). Include only what is printed between this part's label and that next label. Never let another question's label, stem or options appear inside a band.",
  "Never include an answer inside a band. Exclude any 'Answer', 'Answer:', 'Markscheme', 'Mark scheme', 'Answers', worked solution, answer key, teacher note or highlighted/boxed answer text, and any answer written into the paper. If such an answer block sits between this part and the next label, end the band just above it. Blank ruled answer lines with no writing on them are fine to include.",
  "Give ONE band per page. Never give two bands that cover the same print, and never repeat the same region of a page — a second band is only ever the continuation on the NEXT page.",
  "If an answer or mark scheme is printed on the same page below this part, the band MUST end above the first character of that answer text, even if that means the band is short.",
  "Only set crops to null if you truly cannot locate the part on any page.",
  'answerCrops: the band(s) of page picture(s) showing the OFFICIAL ANSWER / mark scheme for this exact part, so the printed marking points, ticks, fractions and notation are kept as pictures instead of retyped. Paper pages are labelled PAGE N; mark scheme pages are labelled ANSWER PAGE N. Use {"sheet":"answer","page":N,"top":T,"bottom":B} for a mark scheme page and {"sheet":"paper",...} when the answer is printed on a paper page. Start at this part\'s own answer row/label and stop before the next part\'s answer. Give at most two bands, and set answerCrops to null if you cannot locate the answer.',
  "Mark-scheme rows are printed very close together, often a single line apart. Every answerCrops band must be as tight as the printed rows for that one part — a band only one or two lines tall is correct. Never pad a band, and never let the row above or below appear inside it.",
  "answerCrops are required whenever the answer is printed anywhere in the upload: the answer is always shown as this picture and is never retyped for the student.",
  'An inline line such as "Mark scheme 1 = A", "Answer = C", or "1 A" immediately below a multiple-choice question IS that question\'s official answer. Return a separate, very thin answerCrops band around the whole line. Do not mistake it for page furniture and do not omit the question above it.',
  "A question followed immediately by its answer is still a complete question: crops must contain the full question up to the blank strip before the answer, while answerCrops contains only the answer line.",

  "Symbols and units MUST be reproduced as real Unicode characters exactly as printed: \u00b0C, \u00b0F, \u00b5, \u03a9, \u00b1, \u00d7, \u00f7, \u2264, \u2265, \u2248, \u2192, \u21cc, \u221a, \u03b1\u03b2\u03b3\u03bb\u03c0\u0394\u03b8, subscripts/superscripts (H\u2082O, cm\u00b3, m s\u207b\u00b2, 10\u2076).",
  'Never write symbols as words, ASCII stand-ins or escapes: no "degrees C", "deg C", "oC", "^oC", "ohms", "micro", "+/-", "\\\\u00b0", "&deg;", "?C". Write 25 \u00b0C, 4.7 k\u03a9, 3 \u00b5A.',
  'Reply with JSON only: {"questions":[{"extractionKey":"q001","label":"1(a)","questionText":"...","markScheme":"...","expectedAnswer":"3.42 × 10⁻³ mol","numericalAnswer":true,"marks":2,"pages":[3,4],"crops":[{"page":3,"top":0.62,"bottom":0.97},{"page":4,"top":0.05,"bottom":0.3}],"answerCrops":[{"sheet":"answer","page":2,"top":0.31,"bottom":0.4}]}]}',
].join(" ");

const ANSWER_VALUE_AUDIT_SYSTEM = [
  "You read only the specified official mark-scheme block for each requested question.",
  "Use the supplied answerCrops page and top/bottom coordinates as a strict rectangle. Ignore every number outside that rectangle.",
  "For a calculation, identify the actual final result that answers the question by following the equations and marking-point meaning inside the block. Never choose a number merely because it is last.",
  "Never mistake a question number, part label, page number, mark allocation, M1/A1/B1 code, significant-figures instruction, intermediate substitution, or a value from an adjacent row for the answer.",
  "For multiple choice, return only the correct option letter. For a calculation, return only the final numerical result exactly as printed, including sign, exponent, unit, or an explicitly accepted range. For other questions return an empty answer.",
  'Reply with JSON only: {"items":[{"extractionKey":"q001","expectedAnswer":"3.42 × 10⁻³","numericalAnswer":true,"confidence":0.98}]}',
].join(" ");

const CROP_AUDIT_SYSTEM = [
  "You inspect page images from an uploaded question paper and return safe display crops.",
  "For every requested label, locate exactly that ONE answerable part only.",
  "Parts (a), (b), (c), (i), (ii), and (iii) are separate questions. A crop for one part must stop before the next part label.",
  "Include its stem, every answer choice, and any diagram/table belonging to that part exactly once.",
  "Some teacher-made documents repeat the question immediately before an answer or mark scheme. Choose only the first clean question copy. Never include the repeated copy.",
  "Never include Markscheme, Mark scheme, Answer, Answers, solution, marking points, ticks, highlighted answers, or text that gives the answer.",
  "If a diagram or block of choices appears twice on the page, include only the copy belonging to the clean question, never both copies.",
  "Return at most one crop per page. Use a second crop only when the SAME part genuinely continues on the next page.",
  "Crop only through a continuous horizontal strip of completely blank white paper. Never cut through any letter, symbol, line, table, graph, image or diagram.",
  "The bottom boundary should be the first blank white strip immediately after the printed point value such as [1], [2], (1), or (2), when a point value is present. It must be above any answer, solution, mark scheme, repeated question, or next part.",
  "Every requested item has a unique extractionKey. Return that exact key; do not use its possibly repeated printed label as the identifier.",
  'Reply with JSON only: {"items":[{"extractionKey":"q001","crops":[{"page":2,"top":0.12,"bottom":0.34}]}]}',
].join(" ");

const CROSSCHECK_SYSTEM = [
  "You are a bookkeeper checking an uploaded question paper and its mark scheme. You do not transcribe questions.",
  "Report two things only.",
  'totals: for every printed main question number, the total marks printed for the WHOLE question (e.g. "[Total: 9]", "(9 marks)" or the sum shown in the mark scheme). Omit a question when no total is printed.',
  'answerLabels: every question part label that the mark scheme / answer key lists an answer for, using the printed form, e.g. "7(a)", "7(b)(ii)", "12".',
  "Never invent labels or totals. Only report what is printed.",
  'Reply with JSON only: {"totals":[{"question":"7","printedTotal":9}],"answerLabels":["7(a)","7(b)(i)","7(b)(ii)"]}',
].join(" ");

export async function extractQuestionsFromPapers(input: ExtractInput): Promise<ExtractionResult> {
  const key = aiApiKey();

  const documents = buildDocumentContent(input);
  const header = [
    `Curriculum: ${input.curriculum}`,
    `Subject/topic: ${input.subject || "unspecified"}`,
    input.markSchemeFiles.length > 0
      ? 'The first document(s) are the past paper(s); the last document(s) are the mark scheme(s). Either set may be a teacher-made compilation pasted from several papers, in any order. Every official answer lives on an ANSWER PAGE sheet, so every answerCrops band must use sheet "answer".'
      : 'The document(s) may contain both questions and mark schemes combined, pasted together from several papers in any order — separate them yourself. Answer pictures are cut from the same pages as the questions, so answerCrops bands use sheet "paper".',
  ].join("\n");

  let inventory = await runInventory(key, header, documents);

  // Repeat sweeps: messy compilations routinely lose sub-parts in pass one, and
  // a sweep that finds something usually means more is still hiding.
  for (let pass = 0; pass < 2 && inventory.length > 0; pass += 1) {
    const missed = await runSweep(key, header, documents, inventory);
    if (missed.length === 0) break;
    const seen = new Set(inventory.map((i) => i.key.toLowerCase()));
    for (const item of missed) {
      if (seen.has(item.key.toLowerCase())) continue;
      seen.add(item.key.toLowerCase());
      inventory.push(item);
    }
    inventory = inventory.slice(0, MAX_ITEMS);
  }

  const hasAnswerPages = input.markSchemeFiles.length > 0;

  if (inventory.length === 0) {
    // Fall back to a single-pass extraction if the index could not be built.
    return {
      questions: separateQuestionCrops(
        dedupe(await runDetail(key, header, documents, [], true, hasAnswerPages)),
      ),
      warnings: [],
    };
  }

  // Two independent cross-checks before transcription: the printed mark totals
  // and the labels the mark scheme answers. Neither removes anything — they only
  // add parts that were clearly missed, plus notes for the teacher to review.
  const crossCheck = await runCrossCheck(key, header, documents);
  const warnings: string[] = [];
  const missedFromAnswerKey = answerKeyGaps(inventory, crossCheck.answerLabels);
  if (missedFromAnswerKey.length > 0) {
    for (const label of missedFromAnswerKey) {
      inventory.push({ key: `answer-gap-${inventory.length + 1}`, label, marks: 1, pages: [] });
      warnings.push(
        `The mark scheme lists ${label}, which the first read did not find in the paper — it was searched for again. Check it is here, and use "Add a question here" if it is still missing.`,
      );
    }
    inventory = inventory.slice(0, MAX_ITEMS);
  }
  warnings.push(...markTotalNotes(inventory, crossCheck.totals));
  warnings.push(...sequenceGapNotes(inventory));

  const results = await runBatches(key, header, documents, inventory, hasAnswerPages);

  // Any label the detail pass dropped gets one focused retry. The retry may hand
  // back items already present, so only genuinely new keys are appended —
  // otherwise the repeats pile up at the end of the question list.
  const done = new Set(results.map((r) => r.key.toLowerCase()));
  const missing = inventory.filter((i) => !done.has(i.key.toLowerCase()));
  if (missing.length > 0) {
    const retried = await runBatches(key, header, documents, missing, hasAnswerPages);
    for (const item of retried) {
      const itemKey = item.key.toLowerCase();
      if (done.has(itemKey)) continue;
      done.add(itemKey);
      results.push(item);
    }
  }

  const kept = new Set(results.map((r) => r.label.toLowerCase()));
  for (const label of missedFromAnswerKey) {
    if (!kept.has(label.toLowerCase())) {
      warnings.push(`${label} appears in the mark scheme but could not be read from the paper.`);
    }
  }

  return {
    questions: renumberQuestions(separateQuestionCrops(dedupe(results))),
    warnings: [...new Set(warnings)].slice(0, 20),
  };
}

/** Locate one missing printed answer crop from the original saved page images. */
export async function locateAnswerCrop(input: {
  label: string;
  questionText: string;
  markScheme: string;
  pages: UploadedFile[];
}): Promise<QuestionCrop[] | null> {
  if (input.pages.length === 0) return null;
  const key = aiApiKey();
  const documents: Array<Record<string, unknown>> = [];
  input.pages.forEach((file, index) => {
    documents.push({ type: "text", text: `--- ANSWER PAGE ${index + 1} ---` });
    documents.push({
      type: "image_url",
      image_url: { url: `data:${file.mimeType};base64,${file.base64}` },
    });
  });
  const text = await callGateway(
    key,
    [
      "Locate the exact printed mark-scheme answer for the requested question.",
      "Return only its horizontal crop band, starting at its own label and ending before the next answer.",
      "Cut only through blank white space. Never include another answer.",
      "Mark-scheme rows sit very close together, often one line apart. Keep the band as tight as possible — a band only one or two printed lines tall is correct and expected. Never widen it to be safe.",
      'Reply with JSON only: {"answerCrops":[{"page":1,"top":0.2,"bottom":0.3}]}.',
    ].join(" "),
    [
      {
        type: "text",
        text: `Question label: ${input.label}\nQuestion: ${input.questionText}\nExpected answer: ${input.markScheme}`,
      },
      ...documents,
    ],
  );
  const parsed = parseJson(text);
  return parseCropList(parsed["answerCrops"] ?? parsed["answerCrop"], [], "answer", true);
}

/** Bookkeeping only: printed totals per question and the labels the answer key covers. */
async function runCrossCheck(
  key: string,
  header: string,
  documents: Array<Record<string, unknown>>,
): Promise<{ totals: Map<string, number>; answerLabels: string[] }> {
  try {
    const text = await callGateway(key, CROSSCHECK_SYSTEM, [
      {
        type: "text",
        text: `${header}\n\nReport the printed question totals and the labels answered by the mark scheme.`,
      },
      ...documents,
    ]);
    const parsed = parseJson(text);
    const totals = new Map<string, number>();
    for (const raw of Array.isArray(parsed["totals"]) ? (parsed["totals"] as unknown[]) : []) {
      const row = raw as Record<string, unknown>;
      const question = String(row["question"] ?? "")
        .trim()
        .replace(/[^\d]/g, "");
      const total = Math.round(Number(row["printedTotal"]));
      if (question && Number.isFinite(total) && total > 0) totals.set(question, total);
    }
    const answerLabels = (
      Array.isArray(parsed["answerLabels"]) ? (parsed["answerLabels"] as unknown[]) : []
    )
      .map((value) => String(value ?? "").trim())
      .filter((value) => value.length > 0 && value.length <= 20)
      .slice(0, MAX_ITEMS);
    return { totals, answerLabels };
  } catch {
    return { totals: new Map(), answerLabels: [] };
  }
}

/** "7(b)(ii)", "7 b ii" and "7bii" all compare equal. */
function labelKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mainNumberOf(label: string): string {
  return /^\s*\(?(\d{1,3})/.exec(label)?.[1] ?? "";
}

/** Labels the mark scheme answers that no indexed question part covers. */
function answerKeyGaps(inventory: InventoryItem[], answerLabels: string[]): string[] {
  const have = new Set(inventory.map((item) => labelKey(item.label)));
  const seen = new Set<string>();
  const gaps: string[] = [];
  for (const label of answerLabels) {
    const keyed = labelKey(label);
    if (!keyed || have.has(keyed) || seen.has(keyed)) continue;
    // Only trust answer-key labels that name a printed question number.
    if (!mainNumberOf(label)) continue;
    seen.add(keyed);
    gaps.push(label);
  }
  return gaps.slice(0, 30);
}

/** Notes where the parts found do not add up to the paper's printed total. */
function markTotalNotes(inventory: InventoryItem[], totals: Map<string, number>): string[] {
  const sums = new Map<string, number>();
  for (const item of inventory) {
    const main = mainNumberOf(item.label);
    if (!main) continue;
    sums.set(main, (sums.get(main) ?? 0) + item.marks);
  }
  const notes: string[] = [];
  for (const [question, printed] of totals) {
    const found = sums.get(question);
    if (found === undefined || found === printed) continue;
    notes.push(
      `Question ${question} is printed as ${printed} marks but the parts found add up to ${found}. A part may be missing, or the paper's own total may differ.`,
    );
  }
  return notes;
}

const LETTER_SEQUENCE = "abcdefghijklmnopqrstuvwxyz".split("");
const ROMAN_SEQUENCE = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/** Notes gaps such as "question 4 jumps from (a) to (c)". */
function sequenceGapNotes(inventory: InventoryItem[]): string[] {
  const groups = new Map<string, Set<string>>();
  for (const item of inventory) {
    const main = mainNumberOf(item.label);
    if (!main) continue;
    const rest = item.label.slice(item.label.indexOf(main) + main.length).toLowerCase();
    const parts = rest.match(/[a-z]+/g) ?? [];
    const first = parts[0];
    if (!first) continue;
    const set = groups.get(main) ?? new Set<string>();
    set.add(first);
    groups.set(main, set);
  }
  const notes: string[] = [];
  for (const [question, parts] of groups) {
    const list = [...parts];
    const romans = list.filter((p) => ROMAN_SEQUENCE.includes(p));
    const letters = list.filter((p) => p.length === 1 && !romans.includes(p));
    const check = (values: string[], sequence: string[]) => {
      const indexes = values
        .map((v) => sequence.indexOf(v))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
      const first = indexes[0];
      const last = indexes[indexes.length - 1];
      if (first === undefined || last === undefined) return;
      for (let i = first; i <= last; i += 1) {
        if (!indexes.includes(i)) {
          notes.push(
            `Question ${question} has (${sequence[first]}) and (${sequence[last]}) but no (${sequence[i]}) — check whether that part was missed.`,
          );
          return;
        }
      }
    };
    check(letters, LETTER_SEQUENCE);
    check(romans, ROMAN_SEQUENCE);
  }
  return notes.slice(0, 10);
}

/**
 * A final paper-wide guard: two different question parts must not display the
 * same vertical region of a page. Near-identical regions are removed from the
 * later part (which then uses its safe transcript); partial overlaps meet at a
 * single boundary and can never repeat a diagram, choices or wording.
 */
export function separateQuestionCrops(items: ExtractedQuestion[]): ExtractedQuestion[] {
  const output = items.map((item) => ({
    ...item,
    crops: item.crops?.map((crop) => ({ ...crop })) ?? null,
  }));
  const accepted = new Map<number, Array<{ crop: QuestionCrop; question: number }>>();

  for (let question = 0; question < output.length; question += 1) {
    const item = output[question];
    if (!item?.crops) continue;
    const safe: QuestionCrop[] = [];
    for (const crop of item.crops) {
      const earlier = accepted.get(crop.page) ?? [];
      let candidate: QuestionCrop | null = { ...crop };
      for (const previous of earlier) {
        if (!candidate) break;
        const overlap =
          Math.min(candidate.bottom, previous.crop.bottom) -
          Math.max(candidate.top, previous.crop.top);
        if (overlap <= 0) continue;
        const smaller = Math.min(
          candidate.bottom - candidate.top,
          previous.crop.bottom - previous.crop.top,
        );
        if (overlap / smaller >= 0.72) {
          candidate = null;
          break;
        }
        if (candidate.top >= previous.crop.top) {
          candidate.top = Math.max(candidate.top, previous.crop.bottom);
        } else {
          candidate.bottom = Math.min(candidate.bottom, previous.crop.top);
        }
        if (candidate.bottom - candidate.top < 0.006) candidate = null;
      }
      if (!candidate) continue;
      safe.push(candidate);
      earlier.push({ crop: candidate, question });
      accepted.set(candidate.page, earlier);
    }
    item.crops = safe.length > 0 ? safe : null;
  }
  return output;
}

const PART_ROMAN = "i{1,3}|iv|v|vi{1,3}|ix|x";
const RENUMBER_MAIN_HEAD = /^\s*\(?(\d{1,3})\)?\s*[.)]?\s*/i;
const PAREN_SUBPART = new RegExp(`^\\s*\\(\\s*(${PART_ROMAN}|[a-z])\\s*\\)`, "i");
const COMPACT_LETTER_SUBPART = new RegExp(
  `^\\s*([a-z])(?:\\s*\\(?(${PART_ROMAN})\\)?)?(?=\\s|[.):-]|$)`,
  "i",
);
const STANDALONE_ROMAN_SUBPART = new RegExp(`^\\s*\\(?(${PART_ROMAN})\\)?(?=\\s|[.):-]|$)`, "i");

type LeadingQuestionLabel = {
  main: string | null;
  letter: string | null;
  roman: string | null;
  consumed: number;
};

function readLeadingQuestionLabel(text: string): LeadingQuestionLabel | null {
  const mainMatch = RENUMBER_MAIN_HEAD.exec(text);
  const main = mainMatch?.[1] ?? null;
  let consumed = mainMatch?.[0].length ?? 0;
  let rest = text.slice(consumed);
  const parenthesized: string[] = [];

  for (;;) {
    const match = PAREN_SUBPART.exec(rest);
    const value = match?.[1];
    if (!match || !value) break;
    parenthesized.push(value.toLowerCase());
    consumed += match[0].length;
    rest = rest.slice(match[0].length);
  }

  if (parenthesized.length > 0) {
    const first = parenthesized[0] ?? null;
    const second = parenthesized[1] ?? null;
    const firstIsRoman = Boolean(first && new RegExp(`^(?:${PART_ROMAN})$`, "i").test(first));
    return {
      main,
      letter: first && !firstIsRoman ? first : null,
      roman: firstIsRoman ? first : second,
      consumed,
    };
  }

  const compact = COMPACT_LETTER_SUBPART.exec(rest);
  const compactLetter = compact?.[1];
  if (compact && compactLetter) {
    return {
      main,
      letter: compactLetter.toLowerCase(),
      roman: compact[2]?.toLowerCase() ?? null,
      consumed: consumed + compact[0].length,
    };
  }

  if (!main) {
    const roman = STANDALONE_ROMAN_SUBPART.exec(rest);
    const romanValue = roman?.[1];
    if (roman && romanValue) {
      return {
        main: null,
        letter: null,
        roman: romanValue.toLowerCase(),
        consumed: roman[0].length,
      };
    }
  }

  return main ? { main, letter: null, roman: null, consumed } : null;
}

/**
 * Keeps the number printed in the paper and carries it into following standalone
 * subparts. The cut itself is the source of truth: a repeated printed number is
 * never silently changed just because another crop appeared before it.
 */
export function renumberQuestions(items: ExtractedQuestion[]): ExtractedQuestion[] {
  let activeMain: string | null = null;
  let activeLetter: string | null = null;

  return items.map((item) => {
    const parsed = readLeadingQuestionLabel(item.questionText);
    if (parsed?.main) {
      if (parsed.main !== activeMain) activeLetter = null;
      activeMain = parsed.main;
    }
    if (parsed?.letter) activeLetter = parsed.letter;

    const letter = parsed?.letter ?? (parsed?.roman ? activeLetter : null);
    const sub = `${letter ? `(${letter})` : ""}${parsed?.roman ? `(${parsed.roman})` : ""}`;
    const body = parsed
      ? item.questionText.slice(parsed.consumed).replace(/^[\s.):-]+/, "")
      : item.questionText;
    const label = `${activeMain ?? item.pages[0] ?? 1}${sub}`;
    return { ...item, questionText: `${label} ${body}`.trim() };
  });
}

async function runBatches(
  key: string,
  header: string,
  documents: Array<Record<string, unknown>>,
  items: InventoryItem[],
  hasAnswerPages = false,
): Promise<DetailResult[]> {
  const batches: InventoryItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  const results: DetailResult[] = [];
  const CONCURRENCY = 3;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const slice = batches.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      slice.map((batch) =>
        runDetail(key, header, documents, batch, false, hasAnswerPages).catch(
          () => [] as DetailResult[],
        ),
      ),
    );
    for (const part of settled) results.push(...part);
  }
  return results;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function buildDocumentContent(input: ExtractInput): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];
  let paperPage = 0;
  let schemePage = 0;
  const paperCount = input.paperFiles.length;
  let index = -1;
  for (const file of [...input.paperFiles, ...input.markSchemeFiles]) {
    index += 1;
    if (!file.base64) continue;
    const isPaper = index < paperCount;
    const name = file.filename.toLowerCase();
    if (file.mimeType.startsWith("image/")) {
      if (isPaper) {
        paperPage += 1;
        content.push({ type: "text", text: `--- PAGE ${paperPage} of the past paper ---` });
      } else {
        schemePage += 1;
        content.push({ type: "text", text: `--- ANSWER PAGE ${schemePage} (mark scheme) ---` });
      }
      content.push({
        type: "image_url",
        image_url: { url: `data:${file.mimeType};base64,${file.base64}` },
      });
    } else if (file.mimeType === DOCX_MIME || name.endsWith(".docx")) {
      const text = extractDocxText(file.base64);
      content.push({
        type: "text",
        text: `--- Document: ${file.filename} ---\n${text}`,
      });
    } else if (file.mimeType.startsWith("text/") || name.endsWith(".txt")) {
      content.push({
        type: "text",
        text: `--- Document: ${file.filename} ---\n${decodeBase64ToString(file.base64)}`,
      });
    } else if (name.endsWith(".doc")) {
      throw new Error(
        `${file.filename} is an old .doc file, which can't be read. Please save it as PDF or .docx and upload again.`,
      );
    } else {
      content.push({
        type: "file",
        file: {
          filename: file.filename,
          file_data: `data:${file.mimeType};base64,${file.base64}`,
        },
      });
    }
  }
  return content;
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeBase64ToString(base64: string): string {
  return new TextDecoder().decode(base64ToBytes(base64));
}

function extractDocxText(base64: string): string {
  const files = unzipSync(base64ToBytes(base64));
  const parts = Object.keys(files)
    .filter((key) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(key))
    .sort();
  const chunks: string[] = [];
  for (const key of parts) {
    const xml = new TextDecoder().decode(files[key]!);
    const text = xml
      .replace(/<w:p[ >]/g, "\n<w:p ")
      .replace(/<w:tab[^>]*\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text) chunks.push(text);
  }
  const joined = chunks.join("\n\n");
  if (!joined) throw new Error("Could not read any text from the Word document.");
  return joined;
}

async function callGateway(
  _key: string,
  system: string,
  content: Array<Record<string, unknown>>,
): Promise<string> {
  const { response, detail } = await postChatCompletion({
    max_tokens: 16000,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    response_format: { type: "json_object" },
  });

  if (!response.ok) {
    throw new Error(
      `The AI could not read those files (${response.status}). ${detail.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content ?? "";
}

type DetailResult = ExtractedQuestion & { key: string; label: string };

function parseInventoryItems(parsed: Record<string, unknown>, taken: Set<string>): InventoryItem[] {
  const items = Array.isArray(parsed["items"]) ? (parsed["items"] as unknown[]) : [];
  const out: InventoryItem[] = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const label = String(item["label"] ?? "").trim();
    const suppliedKey = String(item["extractionKey"] ?? item["key"] ?? "").trim();
    const key = suppliedKey || `q${String(taken.size + 1).padStart(3, "0")}`;
    if (!label || taken.has(key.toLowerCase())) continue;
    taken.add(key.toLowerCase());
    const pages = Array.isArray(item["pages"])
      ? (item["pages"] as unknown[])
          .map((n) => Math.round(Number(n)))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const kind = String(item["kind"] ?? "")
      .trim()
      .toLowerCase();
    out.push({
      key,
      label,
      marks: Math.max(1, Math.round(Number(item["marks"]) || 1)),
      pages: [...new Set(pages)].slice(0, 3),
      ...(kind ? { kind } : {}),
    });
  }
  return out;
}

async function runInventory(
  key: string,
  header: string,
  documents: Array<Record<string, unknown>>,
): Promise<InventoryItem[]> {
  try {
    const text = await callGateway(key, INVENTORY_SYSTEM, [
      { type: "text", text: `${header}\n\nIndex every answerable question part now.` },
      ...documents,
    ]);
    return parseInventoryItems(parseJson(text), new Set<string>()).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

async function runSweep(
  key: string,
  header: string,
  documents: Array<Record<string, unknown>>,
  found: InventoryItem[],
): Promise<InventoryItem[]> {
  try {
    const text = await callGateway(key, SWEEP_SYSTEM, [
      {
        type: "text",
        text: [
          header,
          "",
          "Already indexed items:",
          found
            .map(
              (f) =>
                `- ${f.key}: printed label ${f.label}${f.pages.length ? ` on PAGE ${f.pages.join(", ")}` : ""}`,
            )
            .join("\n"),
          "",
          "List every answerable question part that is missing from that list.",
        ].join("\n"),
      },
      ...documents,
    ]);
    const taken = new Set(found.map((f) => f.key.toLowerCase()));
    return parseInventoryItems(parseJson(text), taken).slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

async function runDetail(
  key: string,
  header: string,
  documents: Array<Record<string, unknown>>,
  batch: InventoryItem[],
  everything: boolean,
  hasAnswerPages = false,
): Promise<DetailResult[]> {
  const instruction = everything
    ? "Transcribe EVERY answerable question part in the upload with its mark scheme, including multiple-choice items. Do not stop early and do not sample."
    : [
        "Transcribe exactly these part labels, in this order, with their mark schemes:",
        batch
          .map(
            (b) =>
              `- ${b.key}: printed label ${b.label} (${b.marks} mark${b.marks === 1 ? "" : "s"}${
                b.kind === "mcq" ? ", multiple choice — include every option" : ""
              })${b.pages.length ? ` on PAGE ${b.pages.join(", ")}` : ""}`,
          )
          .join("\n"),
      ].join("\n");

  const text = await callGateway(key, DETAIL_SYSTEM, [
    { type: "text", text: `${header}\n\n${instruction}` },
    ...documents,
  ]);

  const parsed = parseJson(text);
  const rows = Array.isArray(parsed["questions"]) ? (parsed["questions"] as unknown[]) : [];

  const details = rows
    .map((raw, rowIndex) => {
      const item = raw as Record<string, unknown>;
      const key =
        String(item["extractionKey"] ?? item["key"] ?? "").trim() ||
        batch[rowIndex]?.key ||
        `result-${rowIndex + 1}`;
      const match =
        batch.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase()) ??
        batch[rowIndex];
      const label = String(item["label"] ?? "").trim() || match?.label || "";
      let questionText = String(item["questionText"] ?? "").trim();
      // Preserve standalone printed sub-parts too. Previously labels such as
      // (b), (iii), aii and aiii could disappear from the transcription, which
      // made the renumbering pass incorrectly start another main question.
      const labelHead = readLeadingQuestionLabel(label);
      const textHead = readLeadingQuestionLabel(questionText);
      const sameHead = Boolean(
        labelHead &&
        textHead &&
        labelHead.main === textHead.main &&
        labelHead.letter === textHead.letter &&
        labelHead.roman === textHead.roman,
      );
      // The detail pass is looking directly at the requested crop. When it
      // reads a different main number from the inventory, trust that visual
      // re-read instead of producing a legacy double prefix such as `9 7.`.
      // Those double prefixes caused every later part to inherit the database
      // position rather than the number visibly printed on the paper.
      const detailHasDifferentPrintedMain = Boolean(
        labelHead?.main && textHead?.main && labelHead.main !== textHead.main,
      );
      if (labelHead && !sameHead && !detailHasDifferentPrintedMain) {
        questionText = `${label} ${questionText}`;
      }
      const pagesFromModel = Array.isArray(item["pages"])
        ? (item["pages"] as unknown[])
            .map((n) => Math.round(Number(n)))
            .filter((n) => Number.isFinite(n) && n > 0)
        : [];
      const pages = match?.pages?.length ? match.pages : [...new Set(pagesFromModel)].slice(0, 3);
      return {
        key,
        label,
        questionText: scrubIdentifiers(normaliseSymbols(questionText)),
        markScheme: normaliseSymbols(String(item["markScheme"] ?? "").trim()),
        expectedAnswer: normaliseSymbols(String(item["expectedAnswer"] ?? "").trim()),
        ...(typeof item["numericalAnswer"] === "boolean"
          ? { numericalAnswer: item["numericalAnswer"] }
          : {}),
        marks: Math.max(1, Math.round(Number(item["marks"]) || match?.marks || 1)),
        pages,
        crops: parseCropList(item["crops"] ?? item["crop"], pages),
        answerCrops: parseCropList(
          item["answerCrops"] ?? item["answerCrop"],
          [],
          hasAnswerPages ? "answer" : "paper",
          true,
        ),
      };
    })
    .filter((item) => item.questionText.length > 0);

  if (details.length === 0) return details;
  try {
    // The detail pass already located most crops. A second full visual read was
    // expensive and could replace a good location with whitespace, so only ask
    // the crop specialist about items that genuinely have no crop.
    const missingCrops = details.filter((detail) => !detail.crops?.length);
    const [audited, answers] = await Promise.all([
      missingCrops.length > 0
        ? runCropAudit(key, header, documents, missingCrops).catch(() => new Map())
        : Promise.resolve(new Map<string, QuestionCrop[] | null>()),
      runAnswerValueAudit(key, header, documents, details).catch(() => new Map()),
    ]);
    return details.map((detail) => {
      const lookup = detail.key.toLowerCase();
      const auditedAnswer = answers.get(lookup);
      const calculation =
        detail.numericalAnswer || looksNumericalQuestion(detail.questionText, detail.markScheme);
      return {
        ...detail,
        // An omitted audit row is not evidence that a valid first-pass crop is
        // unsafe. Only replace a crop when the audit explicitly reports the item.
        crops: audited.has(lookup)
          ? reconcileCropAudit(detail.crops, audited.get(lookup) ?? null)
          : detail.crops,
        ...(auditedAnswer ??
          (calculation && (detail.answerCrops?.length ?? 0) > 0
            ? { expectedAnswer: "", numericalAnswer: true }
            : {})),
      };
    });
  } catch {
    return details;
  }
}

/**
 * A second AI pass may tighten a crop, but it must not jump to an unrelated
 * blank strip. Keep the first independently-found location unless the audit
 * overlaps it on the same page.
 */
export function reconcileCropAudit(
  original: QuestionCrop[] | null | undefined,
  audited: QuestionCrop[] | null,
) {
  if (!original?.length) return audited;
  if (!audited?.length) return original;
  const credible = audited.filter((candidate) =>
    original.some((first) => {
      if (first.page !== candidate.page || first.sheet !== candidate.sheet) return false;
      const overlap = Math.min(first.bottom, candidate.bottom) - Math.max(first.top, candidate.top);
      return (
        overlap > 0 &&
        overlap / Math.min(first.bottom - first.top, candidate.bottom - candidate.top) >= 0.25
      );
    }),
  );
  return credible.length > 0 ? credible : original;
}

async function runAnswerValueAudit(
  key: string,
  header: string,
  documents: Array<Record<string, unknown>>,
  details: DetailResult[],
) {
  const candidates = details.filter(
    (item) =>
      (item.answerCrops?.length ?? 0) > 0 &&
      (item.numericalAnswer ||
        looksNumericalQuestion(item.questionText, item.markScheme) ||
        extractChoiceAnswer(item.expectedAnswer || item.markScheme)),
  );
  const results = new Map<string, { expectedAnswer: string; numericalAnswer: boolean }>();
  if (candidates.length === 0) return results;
  const request = candidates
    .map((item) => {
      const blocks = (item.answerCrops ?? [])
        .map(
          (crop) =>
            `${crop.sheet === "answer" ? "ANSWER PAGE" : "PAGE"} ${crop.page}, vertical ${crop.top.toFixed(4)} to ${crop.bottom.toFixed(4)}`,
        )
        .join("; ");
      return `- ${item.key}: ${item.questionText.slice(0, 220)}\n  Read ONLY: ${blocks}`;
    })
    .join("\n");
  const text = await callGateway(key, ANSWER_VALUE_AUDIT_SYSTEM, [
    { type: "text", text: `${header}\n\n${request}` },
    ...documents,
  ]);
  const parsed = parseJson(text);
  const rows = Array.isArray(parsed["items"]) ? (parsed["items"] as unknown[]) : [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const itemKey = String(row["extractionKey"] ?? "")
      .trim()
      .toLowerCase();
    if (!itemKey || !candidates.some((item) => item.key.toLowerCase() === itemKey)) continue;
    const confidence = Number(row["confidence"] ?? 0);
    const expectedAnswer = normaliseSymbols(String(row["expectedAnswer"] ?? "").trim());
    if (confidence < 0.75 || !expectedAnswer) continue;
    results.set(itemKey, {
      expectedAnswer,
      numericalAnswer: row["numericalAnswer"] === true,
    });
  }
  return results;
}

async function runCropAudit(
  key: string,
  header: string,
  documents: Array<Record<string, unknown>>,
  details: DetailResult[],
) {
  const request = details
    .map(
      (item) =>
        `- ${item.key}: printed label ${item.label}${item.pages.length ? ` on PAGE ${item.pages.join(", ")}` : ""}: ${item.questionText.slice(0, 180)}`,
    )
    .join("\n");
  const text = await callGateway(key, CROP_AUDIT_SYSTEM, [
    {
      type: "text",
      text: `${header}\n\nReturn safe crops for only these separate parts:\n${request}`,
    },
    ...documents,
  ]);
  const parsed = parseJson(text);
  const items = Array.isArray(parsed["items"]) ? (parsed["items"] as unknown[]) : [];
  const allowed = new Map(details.map((item) => [item.key.toLowerCase(), item.pages]));
  const result = new Map<string, QuestionCrop[] | null>();
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const key = String(item["extractionKey"] ?? item["key"] ?? "")
      .trim()
      .toLowerCase();
    const pages = allowed.get(key);
    if (!pages) continue;
    result.set(key, parseCropList(item["crops"] ?? item["crop"], pages));
  }
  return result;
}

/**
 * Reads the model's snip band for a question and keeps it only when it is a
 * sane region of a real page — a slightly padded band, never a sliver.
 */
function parseCropValue(
  raw: unknown,
  pages: number[],
  defaultSheet: "paper" | "answer" = "paper",
  answerMode = false,
): QuestionCrop | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  // When the teacher uploaded a separate answer-key document, an answer crop
  // without an explicit sheet belongs to that document, not the question paper.
  const rawSheet = String(value["sheet"] ?? defaultSheet).toLowerCase();
  const sheet = rawSheet === "answer" ? "answer" : "paper";
  const page = Math.round(Number(value["page"]));
  let top = Number(value["top"]);
  let bottom = Number(value["bottom"]);
  if (!Number.isFinite(page) || page <= 0) return null;
  if (sheet === "paper" && pages.length > 0 && !pages.includes(page)) return null;
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  if (bottom <= top) return null;
  const isAnswer = answerMode;
  // Question cuts keep a little breathing room. Answer rows can be only one
  // printed line tall, so preserve their exact bounds without adding padding.
  if (!isAnswer) {
    top = Math.max(0, top - 0.012);
    bottom = Math.min(1, bottom + 0.003);
  }
  if (bottom - top < (isAnswer ? 0.006 : 0.02)) return null;
  return { sheet, page, top, bottom };
}

/**
 * Reads one or more snip bands. A question that runs over a page break gives
 * two bands (foot of one page, head of the next); they are kept in reading
 * order so the student sees the whole question joined together.
 */
function parseCropList(
  raw: unknown,
  pages: number[],
  defaultSheet: "paper" | "answer" = "paper",
  answerMode = false,
): QuestionCrop[] | null {
  const list = Array.isArray(raw) ? raw : [raw];
  const out: QuestionCrop[] = [];
  for (const entry of list) {
    const band = parseCropValue(entry, pages, defaultSheet, answerMode);
    if (!band) continue;
    // There can only be one crop for a question part on one page. If the model
    // reports it twice, keep the shared/narrower region rather than expanding.
    const same = out.find(
      (b) => b.page === band.page && (b.sheet ?? "paper") === (band.sheet ?? "paper"),
    );
    if (same) {
      const overlaps = band.top < same.bottom + 0.02 && band.bottom > same.top - 0.02;
      const sharedTop = Math.max(same.top, band.top);
      const sharedBottom = Math.min(same.bottom, band.bottom);
      if (overlaps && sharedBottom > sharedTop + 0.035) {
        same.top = sharedTop;
        same.bottom = sharedBottom;
      } else if (band.bottom - band.top < same.bottom - same.top) {
        same.top = band.top;
        same.bottom = band.bottom;
      }
      continue;
    }
    out.push(band);
    if (out.length === 3) break;
  }
  out.sort((a, b) =>
    (a.sheet ?? "paper") !== (b.sheet ?? "paper")
      ? (a.sheet ?? "paper") === "paper"
        ? -1
        : 1
      : a.page === b.page
        ? a.top - b.top
        : a.page - b.page,
  );
  return out.length > 0 ? out : null;
}

/**
 * Removes anything a student could search on (year, exam board, session and
 * paper codes, copyright and website lines) from extracted question text.
 */

export function scrubIdentifiers(input: string): string {
  return input
    .replace(/^\s*(?:©|\(c\))\s*(?:19|20)\d{2}[^\n]*$/gim, "")
    .replace(
      /\b(UCLES|Cambridge Assessment|Cambridge International|CAIE|Edexcel|Pearson|AQA|OCR|WJEC|International Baccalaureate|IBO)\b[^\n]*/gi,
      "",
    )
    .replace(
      /\b(?:May|June|October|November|January|February|March)\s*\/?\s*(?:19|20)\d{2}\b/gi,
      "",
    )
    .replace(/\b\d{4}\/\d{2}\/[A-Z]\/[A-Z]\/[A-Z]{2}\b/g, "")
    .replace(/\b\d{4}\/\d{2}\b/g, "")
    .replace(/\b(?:19|20)\d{2}\b(?!\s*(?:cm|mm|m|km|g|kg|s|ml|cm3|J|N|K|°))/g, "")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(
      /\b(?:Turn over|BLANK PAGE|For Examiner'?s Use|Candidate (?:Name|Number)|Centre Number|Syllabus (?:code|number)|Paper \d+)\b[^\n]*/gi,
      "",
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The page region a question is cut from, rounded so tiny drifts still match. */
function cropSignature(item: ExtractedQuestion | DetailResult): string | null {
  const crops = item.crops;
  if (!crops || crops.length === 0) return null;
  return crops
    .map((crop) => {
      const sheet =
        "sheet" in crop ? String((crop as { sheet?: string }).sheet ?? "paper") : "paper";
      return `${sheet}:${crop.page}:${crop.top.toFixed(2)}:${crop.bottom.toFixed(2)}`;
    })
    .sort()
    .join("|");
}

function dedupe(items: Array<ExtractedQuestion | DetailResult>): ExtractedQuestion[] {
  const seen = new Set<string>();
  const seenRegions = new Set<string>();
  const out: ExtractedQuestion[] = [];
  for (const item of items) {
    if (!item.questionText) continue;
    // Compilations legitimately repeat similar openings, so compare the whole
    // wording (whitespace-normalised) instead of the first few words.
    const fingerprint = item.questionText.replace(/\s+/g, " ").trim().toLowerCase();
    if (seen.has(fingerprint)) continue;
    // The same picture must never be published twice, even when the wording the
    // reader returned for it differs slightly between passes.
    const region = cropSignature(item);
    if (region && seenRegions.has(region)) continue;
    seen.add(fingerprint);
    if (region) seenRegions.add(region);
    out.push({
      questionText: item.questionText,
      markScheme: item.markScheme,
      marks: item.marks,
      expectedAnswer: item.expectedAnswer?.trim() || extractChoiceAnswer(item.markScheme) || "",
      numericalAnswer:
        item.numericalAnswer || looksNumericalQuestion(item.questionText, item.markScheme),
      pages: item.pages,
      crops: item.crops ?? null,
      answerCrops: item.answerCrops ?? null,
    });
  }
  return out;
}

function parseJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const slice = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    throw new Error("The AI reply could not be read. Try uploading fewer pages at a time.");
  }
}

/**
 * Repairs symbols the model commonly mangles (degrees Celsius, micro, ohm,
 * superscripts, mojibake from mis-decoded UTF-8) so the printed notation is kept.
 */
export function normaliseSymbols(input: string): string {
  // Strip any LaTeX / markdown the model transcribed ("$^{235}_{92}\\text{U}$")
  // so students read ²³⁵₉₂U instead of raw markup.
  let text = cleanMathText(input);

  // Mojibake: UTF-8 bytes read as Latin-1 (e.g. "Â°C", "Î©", "Âµ").
  if (/[ÂÃÎ][\u0080-\u00bf\u0090-\u00ff]/.test(text)) {
    try {
      const bytes = Uint8Array.from([...text].map((ch) => ch.charCodeAt(0) & 0xff));
      const repaired = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (!repaired.includes("\uFFFD")) text = repaired;
    } catch {
      /* keep original */
    }
  }

  const replacements: Array<[RegExp, string]> = [
    [/\u00c2\u00b0/g, "\u00b0"],
    [/\uFFFD(?=\s?[CF]\b)/g, "\u00b0"],
    [/\\u00b0/gi, "\u00b0"],
    [/&deg;?/gi, "\u00b0"],
    [/\bdeg(?:rees)?\s*(?:\.|\s)?\s*([CFK])\b/gi, "\u00b0$1"],
    [/(\d)\s*(?:\^o|\^0|\*o|\bo\b|\u00ba|\u25e6)\s*([CF])\b/g, "$1 \u00b0$2"],
    [/(?<![A-Za-z0-9])(?:\^o|\^0|\u00ba|\u25e6)\s*([CF])\b/g, "\u00b0$1"],
    [/(\d)\s*o\s*C\b/g, "$1 \u00b0C"],
    [/(\d\s*[kM]?)\s*ohms?\b/g, "$1\u03a9"],
    [/\bohms?\b/g, "\u03a9"],
    [/\bmicro(?=\s?[a-zA-Z])/g, "\u00b5"],
    [/\+\/-/g, "\u00b1"],
    [/\bx\s*10\s*\^\s*(-?\d+)/g, "\u00d7 10^$1"],
    [/\bdegrees?\b(?!\s*[CFK])/gi, "\u00b0"],
  ];
  for (const [pattern, value] of replacements) text = text.replace(pattern, value);

  // Tidy spacing around the degree sign: "25 °C" stays, "25°  C" collapses.
  text = text.replace(/\u00b0\s+([CFK])\b/g, "\u00b0$1");
  return text;
}
