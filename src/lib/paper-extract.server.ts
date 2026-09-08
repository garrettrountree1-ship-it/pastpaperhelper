import { unzipSync } from "fflate";
import { cleanMathText } from "@/lib/math-text";

import { TUTOR_MODEL } from "./ai-gateway.server";

export type QuestionCrop = {
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
  /** 1-based page numbers of the uploaded paper this part appears on. */
  pages: number[];
  /** Region(s) of the page(s) to show the student, in reading order. */
  crops?: QuestionCrop[] | null;
};



export type UploadedFile = {
  filename: string;
  mimeType: string;
  base64: string;
};

type ExtractInput = {
  curriculum: string;
  subject: string;
  paperFiles: UploadedFile[];
  markSchemeFiles: UploadedFile[];
};

type InventoryItem = { label: string; marks: number; pages: number[]; kind?: string };

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const BATCH_SIZE = 6;
const MAX_ITEMS = 300;

const SHARED_RULES = [
  "You digitise IGCSE, A-Level and IB past papers into homework questions.",
  "The upload is often NOT a clean official paper: teachers paste questions and mark schemes together from several different papers into a Word document or PDF, in any order, with inconsistent numbering, duplicated numbers, missing numbers, stray headings, tables and screenshots.",
  "Papers mix question types freely: multiple choice (A/B/C/D), short answer, calculations, diagram/drawing tasks and extended writing. Treat every one of them as a question.",
  "Every answerable sub-part is its own item: 1(a), 1(b)(i), 1(b)(ii), 2(a) ... Never merge sub-parts and never summarise a paper down to a few sample questions.",
  "Work through the documents page by page, in order, from the first question to the very last one, including anything that appears after a mark scheme block or between mark scheme blocks.",
  "Never skip a question because it looks out of place, unnumbered, repeated, or because its numbering clashes with an earlier one.",
].join(" ");

const INVENTORY_SYSTEM = [
  SHARED_RULES,
  "Task: produce a COMPLETE index of every answerable question part in the upload.",
  "Do not write the question wording or the answers here — only the part label, its marks and its type.",
  "Use the printed label exactly where one exists, e.g. \"1(a)\", \"1(b)(ii)\", \"3\", \"7(c)\".",
  "When numbering is missing, ambiguous or repeats a label you already used, invent a unique stable label instead of skipping the question: \"p3-Q1\", \"p3-Q1b\", \"MCQ-4\". Never output the same label twice.",
  "If a question has no sub-parts, list the question number alone.",
  "Include every part: multiple choice items, one-mark recall items, calculations, diagram/graph tasks and extended-writing tasks.",
  "kind: \"mcq\" for multiple-choice items with printed options, otherwise \"short\".",
  "Anything that is only a mark scheme / answer block for a question you have already indexed is NOT a new item.",
  "Each paper page is supplied as an image labelled PAGE 1, PAGE 2, ... Record which page(s) each part appears on, including a page that only holds its figure, diagram, graph or table.",
  'Reply with JSON only: {"items":[{"label":"1(a)","marks":2,"kind":"short","pages":[3]}]}',
].join(" ");

const SWEEP_SYSTEM = [
  SHARED_RULES,
  "Task: a first pass already indexed some question parts. Find the ones it MISSED.",
  "You are given the labels already found. Scan the whole upload again and list only answerable question parts that are not already covered.",
  "Pay special attention to multiple-choice blocks, questions pasted mid-document, questions after a mark scheme section, and unnumbered questions.",
  "Give missed items a unique label that does not clash with the supplied list (e.g. \"p5-Q2\").",
  "If nothing was missed, reply with an empty items array.",
  'Reply with JSON only: {"items":[{"label":"p5-Q2","marks":1,"kind":"mcq","pages":[5]}]}',
].join(" ");

const DETAIL_SYSTEM = [
  SHARED_RULES,
  "Task: for ONLY the requested part labels, transcribe the question and align the official mark scheme.",
  "questionText: start with the part label, then reproduce the printed wording CHARACTER FOR CHARACTER. You are an OCR transcriber, not an editor or a rewriter.",
  "For multiple-choice questions, transcribe the stem AND every printed option on its own line, keeping the printed option letters/numbers (A, B, C, D). Never drop, reorder or reword options.",
  "ABSOLUTE RULE: never change, modernise, simplify, translate, correct, shorten, expand or reorder ANY word of the question. Do not swap a word for a synonym (no \"work out\" for \"calculate\", no \"find\" for \"determine\", no \"picture\" for \"Fig.\"). Do not fix the paper's spelling, capitalisation, punctuation, spacing or British/American usage. Do not add words such as \"the\", \"your\" or \"please\" that are not printed, and do not drop printed words.",
  "Keep the printed line structure, bracketed instructions, blank-line dots and \"[2]\" style mark tags out of the wording only if they are page furniture; everything the student reads stays exactly as printed.",
  "If part of the wording is unreadable in the scan, transcribe what is legible and put [unclear] at that spot — never guess or paraphrase a replacement.",
  "NEVER describe or re-draw a figure, diagram, graph, table, circuit or chemical structure in words: the original paper page image is attached to the question for the student to look at. Instead transcribe the wording and refer to it as printed (e.g. \"Fig. 2.1\").",
  "Equations, formulae and expressions must be transcribed exactly as printed, keeping symbols, indices, fractions and units.",
  "NEVER use LaTeX or markdown: no $ or $$ delimiters, no \\\\frac, \\\\text, \\\\times, ^{ }, _{ }, no ** bold. Write maths in plain text with real Unicode characters instead — nuclide symbols as ²³⁵₉₂U, indices as m², formulae as H₂O, and fractions as (y - b)/m, with °C, °F, ×, ÷, ≤, ≥, ≈, →, π, Δ, Ω, µ, ± typed directly.",
  "markScheme: the official marking points for that exact part, verbatim where possible, with accepted alternatives and mark allocation. The mark scheme may sit far away from the question in the upload, or immediately under it — search the whole document for it.",
  "For multiple choice, the mark scheme is the correct option letter plus a one-line reason, e.g. \"C (1 mark) — ...\".",
  "If no mark scheme is supplied anywhere for that part, write a concise expected answer with marking points instead.",
  "marks: the integer marks for that part (default 1).",
  "Return one item per requested label, in the same order, and never skip a label.",
  "crops: the band(s) of the page picture(s) that must be shown to the student for this part, so nothing printed is lost. Give a list: [{\"page\":N,\"top\":T,\"bottom\":B}] where T and B are fractions of that page's full height measured from the top of the page (0 = very top, 1 = very bottom).",
  "When the part runs over a page break — for example the wording is at the foot of one page and its options, table or diagram continue at the top of the next — give TWO bands in reading order: the tail of the first page, then the head of the next page. Never drop the continuation and never set crops to null just because it spans pages.",
  "Boundaries: a band starts at this part's own printed label and stops immediately BEFORE the next printed question or part label (the next number, the next (a)/(b), the next (i)/(ii)). Include only what is printed between this part's label and that next label. Never let another question's label, stem or options appear inside a band.",
  "Never include an answer inside a band. Exclude any 'Answer', 'Answer:', 'Markscheme', 'Mark scheme', 'Answers', worked solution, answer key, teacher note or highlighted/boxed answer text, and any answer written into the paper. If such an answer block sits between this part and the next label, end the band just above it. Blank ruled answer lines with no writing on them are fine to include.",
  "Give ONE band per page. Never give two bands that cover the same print, and never repeat the same region of a page — a second band is only ever the continuation on the NEXT page.",
  "If an answer or mark scheme is printed on the same page below this part, the band MUST end above the first character of that answer text, even if that means the band is short.",
  "Only set crops to null if you truly cannot locate the part on any page.",

  "Symbols and units MUST be reproduced as real Unicode characters exactly as printed: \u00b0C, \u00b0F, \u00b5, \u03a9, \u00b1, \u00d7, \u00f7, \u2264, \u2265, \u2248, \u2192, \u21cc, \u221a, \u03b1\u03b2\u03b3\u03bb\u03c0\u0394\u03b8, subscripts/superscripts (H\u2082O, cm\u00b3, m s\u207b\u00b2, 10\u2076).",
  "Never write symbols as words, ASCII stand-ins or escapes: no \"degrees C\", \"deg C\", \"oC\", \"^oC\", \"ohms\", \"micro\", \"+/-\", \"\\\\u00b0\", \"&deg;\", \"?C\". Write 25 \u00b0C, 4.7 k\u03a9, 3 \u00b5A.",
  'Reply with JSON only: {"questions":[{"label":"1(a)","questionText":"...","markScheme":"...","marks":2,"pages":[3,4],"crops":[{"page":3,"top":0.62,"bottom":0.97},{"page":4,"top":0.05,"bottom":0.3}]}]}',


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
  'Reply with JSON only: {"items":[{"label":"1(a)","crops":[{"page":2,"top":0.12,"bottom":0.34}]}]}',
].join(" ");


export async function extractQuestionsFromPapers(
  input: ExtractInput,
): Promise<ExtractedQuestion[]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured yet. Missing LOVABLE_API_KEY.");

  const documents = buildDocumentContent(input);
  const header = [
    `Curriculum: ${input.curriculum}`,
    `Subject/topic: ${input.subject || "unspecified"}`,
    input.markSchemeFiles.length > 0
      ? "The first document(s) are the past paper(s); the last document(s) are the mark scheme(s). Either set may be a teacher-made compilation pasted from several papers, in any order."
      : "The document(s) may contain both questions and mark schemes combined, pasted together from several papers in any order — separate them yourself.",
  ].join("\n");

  let inventory = await runInventory(key, header, documents);

  if (inventory.length > 0) {
    // Second sweep: messy compilations routinely lose questions in pass one.
    const missed = await runSweep(key, header, documents, inventory);
    if (missed.length > 0) {
      const seen = new Set(inventory.map((i) => i.label.toLowerCase()));
      for (const item of missed) {
        if (seen.has(item.label.toLowerCase())) continue;
        seen.add(item.label.toLowerCase());
        inventory.push(item);
      }
      inventory = inventory.slice(0, MAX_ITEMS);
    }
  }

  if (inventory.length === 0) {
    // Fall back to a single-pass extraction if the index could not be built.
    return separateQuestionCrops(dedupe(await runDetail(key, header, documents, [], true)));
  }

  const results = await runBatches(key, header, documents, inventory);

  // Any label the detail pass dropped gets one focused retry.
  const done = new Set(results.map((r) => r.label.toLowerCase()));
  const missing = inventory.filter((i) => !done.has(i.label.toLowerCase()));
  if (missing.length > 0) {
    results.push(...(await runBatches(key, header, documents, missing)));
  }

  return renumberQuestions(separateQuestionCrops(dedupe(results)));
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
        const overlap = Math.min(candidate.bottom, previous.crop.bottom) - Math.max(candidate.top, previous.crop.top);
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
        if (candidate.bottom - candidate.top < 0.04) candidate = null;
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

const RENUMBER_HEAD = new RegExp(
  "^\\s*\\(?(\\d{1,3})\\)?\\s*[.)]?\\s*((?:\\(\\s*(?:i{1,3}|iv|v|vi{1,3}|ix|x|[a-z])\\s*\\)\\s*)*)",
  "i",
);
const STANDALONE_SUB_HEAD = new RegExp(
  "^\\s*(\\(\\s*(?:i{1,3}|iv|v|vi{1,3}|ix|x|[a-z])\\s*\\)|(?:[a-z])[.)])\\s*",
  "i",
);

/**
 * Teachers often paste questions with wrong, repeated or missing numbering.
 * Questions are renumbered 1, 2, 3 ... in upload order, while printed
 * sub-part letters (a)(i) are kept and regrouped under the new number.
 */
export function renumberQuestions(items: ExtractedQuestion[]): ExtractedQuestion[] {
  let counter = 0;
  let prevMain: string | null = null;
  let usedSubs = new Set<string>();
  let activeLetter: string | null = null;

  return items.map((item) => {
    const head = RENUMBER_HEAD.exec(item.questionText);
    const standalone = head ? null : STANDALONE_SUB_HEAD.exec(item.questionText);
    const main = head?.[1] ?? (standalone && prevMain ? prevMain : null);
    const printedSub = (head?.[2] ?? "").replace(/\s+/g, "").toLowerCase();
    const standaloneToken = standalone?.[1]?.replace(/[^a-z]/gi, "").toLowerCase() ?? "";
    const romanStandalone = /^(?:i{1,3}|iv|v|vi{1,3}|ix|x)$/.test(standaloneToken);
    const sub = head
      ? printedSub
      : standaloneToken
        ? `${romanStandalone && activeLetter ? `(${activeLetter})` : ""}(${standaloneToken})`
        : "";
    const body = head
      ? item.questionText.slice(head[0].length).replace(/^[\s.):-]+/, "")
      : standalone
        ? item.questionText.slice(standalone[0].length).replace(/^[\s.):-]+/, "")
        : item.questionText;

    if (!sub || main === null || (head && main !== prevMain) || usedSubs.has(sub)) {
      counter += 1;
      usedSubs = new Set<string>();
      activeLetter = null;
    }
    if (main) prevMain = main;
    if (sub) usedSubs.add(sub);
    const parts = [...sub.matchAll(/\(([a-z]+)\)/g)].map((match) => match[1] ?? "");
    const letter = parts.find((part) => /^[a-hj-uw-z]$/.test(part));
    if (letter) activeLetter = letter;

    const label = `${counter}${sub}`;
    return { ...item, questionText: `${label} ${body}`.trim() };
  });
}


async function runBatches(
  key: string,
  header: string,
  documents: Array<Record<string, unknown>>,
  items: InventoryItem[],
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
        runDetail(key, header, documents, batch, false).catch(() => [] as DetailResult[]),
      ),
    );
    for (const part of settled) results.push(...part);
  }
  return results;
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function buildDocumentContent(input: ExtractInput): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];
  let paperPage = 0;
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
        content.push({ type: "text", text: `--- Mark scheme page: ${file.filename} ---` });
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
  key: string,
  system: string,
  content: Array<Record<string, unknown>>,
): Promise<string> {
  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: TUTOR_MODEL,
      max_tokens: 16000,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `The AI could not read those files (${response.status}). ${detail.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content ?? "";
}

type DetailResult = ExtractedQuestion & { label: string };

function parseInventoryItems(parsed: Record<string, unknown>, taken: Set<string>): InventoryItem[] {
  const items = Array.isArray(parsed["items"]) ? (parsed["items"] as unknown[]) : [];
  const out: InventoryItem[] = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const label = String(item["label"] ?? "").trim();
    if (!label || taken.has(label.toLowerCase())) continue;
    taken.add(label.toLowerCase());
    const pages = Array.isArray(item["pages"])
      ? (item["pages"] as unknown[])
          .map((n) => Math.round(Number(n)))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const kind = String(item["kind"] ?? "").trim().toLowerCase();
    out.push({
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
          "Already indexed labels:",
          found.map((f) => `- ${f.label}`).join("\n"),
          "",
          "List every answerable question part that is missing from that list.",
        ].join("\n"),
      },
      ...documents,
    ]);
    const taken = new Set(found.map((f) => f.label.toLowerCase()));
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
): Promise<DetailResult[]> {
  const instruction = everything
    ? "Transcribe EVERY answerable question part in the upload with its mark scheme, including multiple-choice items. Do not stop early and do not sample."
    : [
        "Transcribe exactly these part labels, in this order, with their mark schemes:",
        batch
          .map(
            (b) =>
              `- ${b.label} (${b.marks} mark${b.marks === 1 ? "" : "s"}${
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
      const label = String(item["label"] ?? "").trim() || batch[rowIndex]?.label || "";
      let questionText = String(item["questionText"] ?? "").trim();
      // Only printed numbering is echoed into the wording; invented keys (p3-Q1) are not.
      const printed = /^\d/.test(label);
      if (printed && !questionText.toLowerCase().startsWith(label.toLowerCase())) {
        questionText = `${label} ${questionText}`;
      }
      const match = batch.find((b) => b.label.toLowerCase() === label.toLowerCase());
      const pagesFromModel = Array.isArray(item["pages"])
        ? (item["pages"] as unknown[])
            .map((n) => Math.round(Number(n)))
            .filter((n) => Number.isFinite(n) && n > 0)
        : [];
      const pages = match?.pages?.length ? match.pages : [...new Set(pagesFromModel)].slice(0, 3);
      return {
        label,
        questionText: scrubIdentifiers(normaliseSymbols(questionText)),
        markScheme: normaliseSymbols(String(item["markScheme"] ?? "").trim()),
        marks: Math.max(1, Math.round(Number(item["marks"]) || match?.marks || 1)),
        pages,
        crops: parseCropList(item["crops"] ?? item["crop"], pages),
      };



    })
    .filter((item) => item.questionText.length > 0);

  if (details.length === 0) return details;
  try {
    const audited = await runCropAudit(key, header, documents, details);
    return details.map((detail) => ({
      ...detail,
      // Once the independent visual audit has run, it is authoritative. A
      // missing/unsafe crop means no picture, not a return to the first pass.
      crops: audited.has(detail.label.toLowerCase())
        ? (audited.get(detail.label.toLowerCase()) ?? null)
        : null,
    }));
  } catch {
    return details;
  }
}

async function runCropAudit(
  key: string,
  header: string,
  documents: Array<Record<string, unknown>>,
  details: DetailResult[],
) {
  const request = details
    .map((item) => `- ${item.label}${item.pages.length ? ` on PAGE ${item.pages.join(", ")}` : ""}: ${item.questionText.slice(0, 180)}`)
    .join("\n");
  const text = await callGateway(key, CROP_AUDIT_SYSTEM, [
    { type: "text", text: `${header}\n\nReturn safe crops for only these separate parts:\n${request}` },
    ...documents,
  ]);
  const parsed = parseJson(text);
  const items = Array.isArray(parsed["items"]) ? (parsed["items"] as unknown[]) : [];
  const allowed = new Map(details.map((item) => [item.label.toLowerCase(), item.pages]));
  const result = new Map<string, QuestionCrop[] | null>();
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const label = String(item["label"] ?? "").trim().toLowerCase();
    const pages = allowed.get(label);
    if (!pages) continue;
    result.set(label, parseCropList(item["crops"] ?? item["crop"], pages));
  }
  return result;
}

/**
 * Reads the model's snip band for a question and keeps it only when it is a
 * sane region of a real page — a slightly padded band, never a sliver.
 */
function parseCropValue(raw: unknown, pages: number[]): QuestionCrop | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const page = Math.round(Number(value["page"]));
  let top = Number(value["top"]);
  let bottom = Number(value["bottom"]);
  if (!Number.isFinite(page) || page <= 0) return null;
  if (pages.length > 0 && !pages.includes(page)) return null;
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  if (bottom <= top) return null;
  // A little breathing room at the top so nothing printed is clipped. The
  // bottom is barely padded: whatever is printed below may be the answer or
  // mark scheme for this very question.
  top = Math.max(0, top - 0.012);
  bottom = Math.min(1, bottom + 0.003);
  if (bottom - top < 0.04) return null;
  return { page, top, bottom };

}

/**
 * Reads one or more snip bands. A question that runs over a page break gives
 * two bands (foot of one page, head of the next); they are kept in reading
 * order so the student sees the whole question joined together.
 */
function parseCropList(raw: unknown, pages: number[]): QuestionCrop[] | null {
  const list = Array.isArray(raw) ? raw : [raw];
  const out: QuestionCrop[] = [];
  for (const entry of list) {
    const band = parseCropValue(entry, pages);
    if (!band) continue;
    // There can only be one crop for a question part on one page. If the model
    // reports it twice, keep the shared/narrower region rather than expanding.
    const same = out.find((b) => b.page === band.page);
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
  out.sort((a, b) => (a.page === b.page ? a.top - b.top : a.page - b.page));
  return out.length > 0 ? out : null;
}


/**
 * Removes anything a student could search on (year, exam board, session and
 * paper codes, copyright and website lines) from extracted question text.
 */

export function scrubIdentifiers(input: string): string {
  return input
    .replace(/©[^\n]*/g, "")
    .replace(/\b(UCLES|Cambridge Assessment|Cambridge International|CAIE|Edexcel|Pearson|AQA|OCR|WJEC|International Baccalaureate|IBO)\b[^\n]*/gi, "")
    .replace(/\b(?:May|June|October|November|January|February|March)\s*\/?\s*(?:19|20)\d{2}\b/gi, "")
    .replace(/\b\d{4}\/\d{2}\/[A-Z]\/[A-Z]\/[A-Z]{2}\b/g, "")
    .replace(/\b\d{4}\/\d{2}\b/g, "")
    .replace(/\b(?:19|20)\d{2}\b(?!\s*(?:cm|mm|m|km|g|kg|s|ml|cm3|J|N|K|°))/g, "")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\b(?:Turn over|BLANK PAGE|For Examiner'?s Use|Candidate (?:Name|Number)|Centre Number|Syllabus (?:code|number)|Paper \d+)\b[^\n]*/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function dedupe(items: Array<ExtractedQuestion | DetailResult>): ExtractedQuestion[] {
  const seen = new Set<string>();
  const out: ExtractedQuestion[] = [];
  for (const item of items) {
    if (!item.questionText) continue;
    // Compilations legitimately repeat similar openings, so compare the whole
    // wording (whitespace-normalised) instead of the first few words.
    const fingerprint = item.questionText.replace(/\s+/g, " ").trim().toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push({
      questionText: item.questionText,
      markScheme: item.markScheme,
      marks: item.marks,
      pages: item.pages,
      crops: item.crops ?? null,
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
