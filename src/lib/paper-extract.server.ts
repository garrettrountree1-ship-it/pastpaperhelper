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

const SYSTEM = [
  "You are an exam-paper digitiser for IGCSE, A-Level and IB homework.",
  "You are given past-paper documents and (possibly separate) official mark scheme documents.",
  "Extract every question that a student can answer in text, and align each question with the matching mark scheme answer.",
  "If a question has sub-parts (a), (b)(i) etc., emit each answerable sub-part as its own item and include its part label in questionText.",
  "questionText: the full wording of the question a student must answer, including any given data. Do not include the answer.",
  "markScheme: the official marking points for that exact question, verbatim where possible, including accepted alternatives.",
  "marks: the integer marks available for that question (default 1 if not stated).",
  "Skip cover pages, instructions, blank pages and questions whose mark scheme you cannot find (unless no mark scheme was supplied, in which case leave markScheme as a short expected-answer summary).",
  'Reply with JSON only, shaped: {"questions":[{"questionText":"...","markScheme":"...","marks":2}]}',
].join(" ");

export async function extractQuestionsFromPapers(
  input: ExtractInput,
): Promise<ExtractedQuestion[]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured yet. Missing LOVABLE_API_KEY.");

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: [
        `Curriculum: ${input.curriculum}`,
        `Subject/topic: ${input.subject || "unspecified"}`,
        input.markSchemeFiles.length > 0
          ? "The first document(s) are the past paper, the last document(s) are the official mark scheme."
          : "The document(s) may contain both the questions and the mark scheme combined — separate them yourself.",
      ].join("\n"),
    },
  ];

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

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: TUTOR_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`The AI could not read those files (${response.status}). ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content ?? "";
  const parsed = safeParse(text);

  return parsed
    .map((item) => ({
      questionText: String(item["questionText"] ?? "").trim(),
      markScheme: String(item["markScheme"] ?? "").trim(),
      marks: Math.max(1, Math.round(Number(item["marks"]) || 1)),
    }))
    .filter((item) => item.questionText.length > 0);
}

function safeParse(text: string): Array<Record<string, unknown>> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const slice = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  try {
    const json = JSON.parse(slice) as { questions?: Array<Record<string, unknown>> };
    return Array.isArray(json.questions) ? json.questions : [];
  } catch {
    throw new Error("The AI reply could not be read. Try uploading fewer pages at a time.");
  }
}
