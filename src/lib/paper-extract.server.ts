import { unzipSync } from "fflate";
import { TUTOR_MODEL } from "./ai-gateway.server";

export type ExtractedQuestion = {
  questionText: string;
  markScheme: string;
  marks: number;
  /** 1-based page numbers of the uploaded paper this part appears on. */
  pages: number[];
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

type InventoryItem = { label: string; marks: number; pages: number[] };

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const BATCH_SIZE = 6;

const SHARED_RULES = [
  "You digitise IGCSE, A-Level and IB past papers into homework questions.",
  "Every answerable sub-part is its own item: 1(a), 1(b)(i), 1(b)(ii), 2(a) ... Never merge sub-parts and never summarise a paper down to a few sample questions.",
  "Work through the documents page by page, in order, from the first question to the very last one.",
].join(" ");

const INVENTORY_SYSTEM = [
  SHARED_RULES,
  "Task: produce a COMPLETE index of every answerable question part in the paper.",
  "Do not write the question wording or the answers here — only the part label and its marks.",
  "Labels must be exactly as printed, e.g. \"1(a)\", \"1(b)(ii)\", \"3\", \"7(c)\".",
  "If a question has no sub-parts, list the question number alone.",
  "Include every part, even easy ones, diagram/graph ones and extended-writing ones.",
  "Each paper page is supplied as an image labelled PAGE 1, PAGE 2, ... Record which page(s) each part appears on, including a page that only holds its figure, diagram, graph or table.",
  'Reply with JSON only: {"items":[{"label":"1(a)","marks":2,"pages":[3]}]}',
].join(" ");

const DETAIL_SYSTEM = [
  SHARED_RULES,
  "Task: for ONLY the requested part labels, transcribe the question and align the official mark scheme.",
  "questionText: start with the part label, then transcribe the full wording the student must answer verbatim, including any stem/context shared with earlier parts, given data and units. Never include the answer.",
  "NEVER describe or re-draw a figure, diagram, graph, table, circuit or chemical structure in words: the original paper page image is attached to the question for the student to look at. Instead transcribe the wording and refer to it as printed (e.g. \"Fig. 2.1\").",
  "Equations, formulae and expressions must be transcribed exactly as printed, keeping symbols, indices, fractions and units; use plain text/LaTeX-style notation only where unavoidable.",
  "markScheme: the official marking points for that exact part, verbatim where possible, with accepted alternatives and mark allocation.",
  "If no mark scheme document was supplied, write a concise expected answer with marking points instead.",
  "marks: the integer marks for that part (default 1).",
  "Return one item per requested label, in the same order, and never skip a label.",
  'Reply with JSON only: {"questions":[{"label":"1(a)","questionText":"...","markScheme":"...","marks":2}]}',
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
      ? "The first document(s) are the past paper; the last document(s) are the official mark scheme."
      : "The document(s) may contain both questions and mark scheme combined — separate them yourself.",
  ].join("\n");

  const inventory = await runInventory(key, header, documents);

  if (inventory.length === 0) {
    // Fall back to a single-pass extraction if the index could not be built.
    return await runDetail(key, header, documents, [], true);
  }

  const batches: InventoryItem[][] = [];
  for (let i = 0; i < inventory.length; i += BATCH_SIZE) {
    batches.push(inventory.slice(i, i + BATCH_SIZE));
  }

  const results: ExtractedQuestion[] = [];
  const CONCURRENCY = 3;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const slice = batches.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      slice.map((batch) =>
        runDetail(key, header, documents, batch, false).catch(() => [] as ExtractedQuestion[]),
      ),
    );
    for (const part of settled) results.push(...part);
  }


  return dedupe(results);
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
    const parsed = parseJson(text);
    const items = Array.isArray(parsed["items"]) ? (parsed["items"] as unknown[]) : [];
    const seen = new Set<string>();
    const out: InventoryItem[] = [];
    for (const raw of items) {
      const item = raw as Record<string, unknown>;
      const label = String(item["label"] ?? "").trim();
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      const pages = Array.isArray(item["pages"])
        ? (item["pages"] as unknown[])
            .map((n) => Math.round(Number(n)))
            .filter((n) => Number.isFinite(n) && n > 0)
        : [];
      out.push({
        label,
        marks: Math.max(1, Math.round(Number(item["marks"]) || 1)),
        pages: [...new Set(pages)].slice(0, 3),
      });
    }
    return out.slice(0, 120);
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
): Promise<ExtractedQuestion[]> {
  const instruction = everything
    ? "Transcribe EVERY answerable question part in the paper with its mark scheme. Do not stop early and do not sample."
    : [
        "Transcribe exactly these part labels, in this order, with their mark schemes:",
        batch
          .map(
            (b) =>
              `- ${b.label} (${b.marks} mark${b.marks === 1 ? "" : "s"})${
                b.pages.length ? ` on PAGE ${b.pages.join(", ")}` : ""
              }`,
          )
          .join("\n"),
      ].join("\n");

  const text = await callGateway(key, DETAIL_SYSTEM, [
    { type: "text", text: `${header}\n\n${instruction}` },
    ...documents,
  ]);

  const parsed = parseJson(text);
  const rows = Array.isArray(parsed["questions"]) ? (parsed["questions"] as unknown[]) : [];

  return rows
    .map((raw) => {
      const item = raw as Record<string, unknown>;
      const label = String(item["label"] ?? "").trim();
      let questionText = String(item["questionText"] ?? "").trim();
      if (label && !questionText.toLowerCase().startsWith(label.toLowerCase())) {
        questionText = `${label} ${questionText}`;
      }
      const match = batch.find((b) => b.label.toLowerCase() === label.toLowerCase());
      const pagesFromModel = Array.isArray(item["pages"])
        ? (item["pages"] as unknown[])
            .map((n) => Math.round(Number(n)))
            .filter((n) => Number.isFinite(n) && n > 0)
        : [];
      return {
        questionText,
        markScheme: String(item["markScheme"] ?? "").trim(),
        marks: Math.max(1, Math.round(Number(item["marks"]) || match?.marks || 1)),
        pages: match?.pages?.length ? match.pages : [...new Set(pagesFromModel)].slice(0, 3),
      };
    })
    .filter((item) => item.questionText.length > 0);
}

function dedupe(items: ExtractedQuestion[]): ExtractedQuestion[] {
  const seen = new Set<string>();
  const out: ExtractedQuestion[] = [];
  for (const item of items) {
    const fingerprint = item.questionText.slice(0, 80).toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push(item);
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
