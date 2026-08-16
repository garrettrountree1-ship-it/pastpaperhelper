import { TUTOR_MODEL } from "./ai-gateway.server";

export type ExtractedQuestion = {
  questionText: string;
  markScheme: string;
  marks: number;
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

type InventoryItem = { label: string; marks: number };

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
  'Reply with JSON only: {"items":[{"label":"1(a)","marks":2}]}',
].join(" ");

const DETAIL_SYSTEM = [
  SHARED_RULES,
  "Task: for ONLY the requested part labels, transcribe the question and align the official mark scheme.",
  "questionText: start with the part label, then the full wording the student must answer, including any stem/context shared with earlier parts, given data and units. Describe any figure or diagram in words. Never include the answer.",
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

  const results: ExtractedQuestion[] = [];
  for (let i = 0; i < inventory.length; i += BATCH_SIZE) {
    const batch = inventory.slice(i, i + BATCH_SIZE);
    const batchResults = await runDetail(key, header, documents, batch, false);
    results.push(...batchResults);
  }

  return dedupe(results);
}

function buildDocumentContent(input: ExtractInput): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];
  for (const file of [...input.paperFiles, ...input.markSchemeFiles]) {
    if (!file.base64) continue;
    if (file.mimeType.startsWith("image/")) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${file.mimeType};base64,${file.base64}` },
      });
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
      out.push({ label, marks: Math.max(1, Math.round(Number(item["marks"]) || 1)) });
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
        batch.map((b) => `- ${b.label} (${b.marks} mark${b.marks === 1 ? "" : "s"})`).join("\n"),
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
      const fallbackMarks = batch.find(
        (b) => b.label.toLowerCase() === label.toLowerCase(),
      )?.marks;
      return {
        questionText,
        markScheme: String(item["markScheme"] ?? "").trim(),
        marks: Math.max(1, Math.round(Number(item["marks"]) || fallbackMarks || 1)),
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
