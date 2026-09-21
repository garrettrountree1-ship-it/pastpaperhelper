import { generateText } from "ai";
import { z } from "zod";

import { gatewayModel, TUTOR_MODEL } from "./ai-gateway.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type MarkPoint = { point: string; marks: number; awarded: boolean };

export type MarkResult = {
  verdict: "correct" | "partial" | "incorrect";
  awardedMarks: number;
  feedback: string;
  explanation: string;
  leadingQuestion: string;
  markPoints: MarkPoint[];
};

const markSchema = z.object({
  verdict: z.string(),
  awardedMarks: z.coerce.number(),
  feedback: z.string().default(""),
  explanation: z.string().default(""),
  leadingQuestion: z.string().default(""),
  markPoints: z
    .array(
      z.object({
        point: z.string().default(""),
        marks: z.coerce.number().default(0),
        awarded: z.coerce.boolean().default(false),
      }),
    )
    .default([]),
});

type MarkInput = {
  curriculum: string;
  subject: string;
  question: string;
  markScheme: string;
  marks: number;
  answer: string;
  imageUrls?: string[];
  /** Original past-paper page images holding the question's figures/equations. */
  questionImageUrls?: string[];
  /** Exact cut picture(s) of the printed official answer / mark scheme for this question. */
  markSchemeImageUrls?: string[];
  /** Ignore working and assess only the final numerical value (photos still require vision). */
  finalNumericOnly?: boolean;
  /** Teacher-verified final value or inclusive range used in final-number-only mode. */
  expectedAnswer?: string;
};

export async function markStudentAnswer(input: MarkInput): Promise<MarkResult> {
  const images = input.imageUrls ?? [];
  const questionImages = input.questionImageUrls ?? [];
  const schemeImages = input.markSchemeImageUrls ?? [];
  const prompt = [
    `Curriculum: ${input.curriculum}`,
    `Subject: ${input.subject || "General"}`,
    `Marks available: ${input.marks}`,
    `Question:\n${input.question}`,
    schemeImages.length > 0
      ? `Transcribed mark scheme (may contain OCR errors — the attached official answer picture is authoritative):\n${input.markScheme}`
      : `Official mark scheme:\n${input.markScheme}`,
    `Student typed answer:\n${input.answer || "(none typed)"}`,
    questionImages.length > 0
      ? `The first ${questionImages.length} attached image(s) are the original past-paper page cut(s) for this question, including any figure, diagram, graph or equation the student is working from.`
      : "",
    schemeImages.length > 0
      ? `The next ${schemeImages.length} attached image(s) are the EXACT cut of the printed official answer key / mark scheme for THIS question. Mark strictly against that picture: read every marking point, its stated mark value and notation (M1, A1, B1, ecf, owtte, accept/reject lists, units, significant figures, tables, diagrams). It is the authoritative source and overrides the transcribed text wherever they disagree. The student's answer does NOT have to match it word for word — award the mark when the meaning is the same, while requiring any key term, value, unit or symbol the printed scheme insists on.`
      : "",
    images.length > 0
      ? `The student also attached ${images.length} photo(s) of handwritten working or a diagram. Read them carefully — that working is part of the answer.`
      : "",
    input.finalNumericOnly
      ? `FINAL-NUMBER-ONLY MODE: read the student's final numerical value, including from handwriting, and compare only that value with the teacher-verified accepted answer ${JSON.stringify(input.expectedAnswer || input.markScheme)}. A range written as "minimum to maximum" is inclusive. Do not assess or award method/working marks separately. Award all available marks for a matching value and no marks otherwise.`
      : "FULL-RUBRIC MODE: assess every calculation step against the printed mark scheme. Award method and accuracy marks separately; a bare final answer earns only the marks the printed rubric allows.",
    "Respond with ONLY a JSON object (no markdown fences, no commentary) of exactly this shape:",
    `{"verdict":"correct|partial|incorrect","awardedMarks":number,"feedback":"string","explanation":"string","leadingQuestion":"string","markPoints":[{"point":"string","marks":number,"awarded":true}]}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = [
    "You are an experienced examiner marking IGCSE, A-Level and IB work strictly against the official mark scheme.",
    "When a picture of the printed official answer key is attached, that picture is the authoritative mark scheme: derive the marking points and their mark values from it, not from any transcription, and mark the student's response against it by meaning rather than exact wording.",
    "Be generous with equivalent wording: a short answer such as a single letter, number, formula or option that matches the mark scheme earns full marks.",
    "Answers may include photos of handwritten maths working, graphs or diagrams; read the images and credit correct working shown there.",
    "When the answer is a photo of handwritten calculation working, mark it step by step: award each method/substitution mark that is correct even if the final answer is wrong, so partial credit is normal. If a diagram or drawing is photographed, judge the drawing itself against the mark scheme (labels, lines, shading, plotted points) rather than expecting typed words.",
    input.finalNumericOnly
      ? "For numerical questions, ignore the method and compare the final value only. Accept equivalent scientific notation and any value inside a teacher-provided inclusive range. Follow any precision or unit requirement explicitly printed in the official answer."
      : "For calculations, follow the printed rubric exactly: inspect the working step by step, award its M/A/B marks independently, and do not invent full credit for a bare final value when the rubric requires method marks.",
    "If a photo is unreadable or shows no relevant working, say so plainly without revealing the answer.",
    "Split the mark scheme into its individual marking points exactly as written (each M1/A1/B1 or bullet worth its stated marks) and return them in markPoints with marks for that point and awarded true/false. The sum of the marks of awarded points MUST equal awardedMarks.",
    "Award marks only for points that genuinely match the mark scheme. Never award more than the marks available and never award negative marks.",
    "verdict is 'correct' only when full marks are earned, 'partial' when some marks are earned, 'incorrect' when none are.",
    "ABSOLUTE RULE: when the student has not earned full marks you must NEVER reveal or hint at the correct answer in feedback, explanation or leadingQuestion. Do not state the required value, word, letter, option, formula, equation, name or final result, and never quote or paraphrase the mark scheme wording. Do not give a worked solution or a 'the answer should be...' sentence. The student must keep trying until they reach it themselves.",
    "Students dislike reading: keep feedback + explanation together under 100 words total, ideally under 60. Be direct, no filler, no restating the question, no generic study advice like 'read the command word'.",
    "feedback: when full marks are earned, one short praise sentence. Otherwise exactly 'Not yet.' or 'Incorrect.' and nothing more.",
    "explanation: when marks are missing, 1-3 short sentences of REAL subject teaching (chemistry/physics/biology/maths reasoning) that names the specific concept, rule or misconception behind the student's error and why their stated idea does not work — while still not revealing the required answer, value, word, formula or mark-scheme wording. If full marks are earned, set explanation to an empty string.",
    "leadingQuestion: at most one short, specific Socratic question about the concept in the explanation. May be an empty string if the explanation is already enough. Empty when fully correct.",
    "Output raw JSON only.",
  ].join(" ");

  // Marking uses the gateway's non-streaming JSON endpoint. The SDK adapter can
  // occasionally receive a stream that closes before its final chunk and then
  // throws "No output generated. Check the stream for errors" even though the
  // request itself was valid. Non-streaming responses avoid that failure mode.
  // Retry transient gateway failures; on the last attempt omit only the
  // question-page pictures (the question text remains) to reduce payload size.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const text = await requestMarkingJson({
        system,
        prompt,
        questionImages: attempt < 2 ? questionImages : [],
        schemeImages,
        answerImages: images,
      });
      const parsed = markSchema.parse(JSON.parse(extractJson(text)));
      return clamp(parsed, input.marks);
    } catch (error) {
      console.error("AI marking attempt failed", {
        attempt: attempt + 1,
        questionImages: attempt < 2 ? questionImages.length : 0,
        schemeImages: schemeImages.length,
        answerImages: images.length,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < 2) await delay(400 * 2 ** attempt);
    }
  }
  throw new Error(
    "We couldn't mark that answer because the marking service returned no result. Your attempt was not counted. Please wait a moment and try again.",
  );
}

async function requestMarkingJson({
  system,
  prompt,
  questionImages,
  schemeImages,
  answerImages,
}: {
  system: string;
  prompt: string;
  questionImages: string[];
  schemeImages: string[];
  answerImages: string[];
}): Promise<string> {
  const request = chatRequest();
  const image = (url: string) => ({ type: "image_url", image_url: { url } });
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      model: request.model,
      max_tokens: 1600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...questionImages.map(image),
            ...schemeImages.map(image),
            ...answerImages.map(image),
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`gateway ${response.status}: ${detail.slice(0, 240)}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error(payload.error?.message || "gateway returned an empty response");
  return text;
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function clamp(result: z.infer<typeof markSchema>, maxMarks: number): MarkResult {
  const awarded = Math.max(0, Math.min(maxMarks, Math.round(result.awardedMarks * 2) / 2));
  const raw = result.verdict.toLowerCase();
  const verdict: MarkResult["verdict"] =
    raw.startsWith("correct") || awarded >= maxMarks
      ? "correct"
      : awarded > 0 || raw.startsWith("partial")
        ? "partial"
        : "incorrect";
  const isCorrect = verdict === "correct";
  return {
    verdict,
    awardedMarks: awarded,
    feedback: isCorrect
      ? limitWords(result.feedback.trim() || "Well done — your answer earns full marks.", 40)
      : [
          verdict === "partial" ? "Not yet." : "Incorrect.",
          limitWords(result.explanation ?? "", 85),
        ]
          .filter(Boolean)
          .join(" "),
    explanation: isCorrect ? "" : limitWords(result.explanation ?? "", 85),
    leadingQuestion: isCorrect ? "" : limitWords(result.leadingQuestion ?? "", 30),
    markPoints: (result.markPoints ?? []).map((p) => ({
      point: p.point.trim(),
      marks: Math.max(0, Math.min(maxMarks, p.marks)),
      awarded: Boolean(p.awarded),
    })),
  };
}

function limitWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  return start >= 0 && end > start ? source.slice(start, end + 1) : source;
}

type TutorTurn = { role: "tutor" | "student"; content: string };

type TutorInput = {
  curriculum: string;
  subject: string;
  question: string;
  markScheme: string;
  marks: number;
  studentAnswer: string;
  history: TutorTurn[];
  latestMessage: string;
  awardedMarks?: number;
  markBreakdown?: MarkPoint[];
  /** Differentiation level chosen by the teacher (or the student, if allowed). */
  level?: "beginner" | "medium" | "advanced";
  /** Language the tutor replies in. */
  language?: string;
};

const LEVEL_STYLE: Record<string, string> = {
  beginner:
    "The student is learning English AND the subject at the same time (CEFR A1-A2). Write like a friendly teacher talking to a beginner: only very common everyday words, one idea per sentence, maximum 8-10 words per sentence, present tense, active voice, no idioms, no passive voice, no long noun phrases, no semicolons, no brackets. Keep the whole reply under 40 words. Use a technical word only if the exam needs it, then put a 2-4 easy-word meaning right after it, like: 'soluble (it can mix into water)'. Never use two new technical words in one reply. End with ONE very short question of 8 words or fewer. Never write a paragraph longer than 3 short sentences.",
  medium:
    "Use clear, plain classroom English. Keep the reply under 90 words, no lists longer than 3 items, and ask exactly one question at the end.",
  advanced:
    "The student is confident. Use accurate subject terminology, expect independent reasoning, and probe the underlying principle rather than the wording. You may use up to 140 words and connect the missing mark to the wider concept, but still reveal nothing from the mark scheme, and finish with one demanding question.",
};

export async function tutorStep(input: TutorInput): Promise<string> {
  const missed = (input.markBreakdown ?? []).filter((p) => !p.awarded);
  const earned = (input.markBreakdown ?? []).filter((p) => p.awarded);
  const level = input.level ?? "medium";
  const language = input.language?.trim() || "English";

  const system = [
    "You are a subject expert tutor for IGCSE, A-Level and IB students, coaching one student toward full marks on one exam question.",
    "You are shown the mark scheme privately. NEVER quote it, never state the final answer, value, word, option, name, equation or result, and never give a sentence the student could copy. If asked for the answer, refuse warmly and teach the idea instead.",
    "Every reply must do three things, in this order: (1) name precisely which marking point is still missing, in exam terms (e.g. 'you have the observation mark but not the explanation mark: nothing yet links the change to bond strength'); (2) teach the science or maths behind that specific mark in one or two plain sentences, so the student learns the idea, not the wording; (3) ask one short question that makes the student produce that missing point themselves.",
    "Also tell the student what a full-mark response needs structurally — how many distinct points, and what type each one is (statement, reason, comparison, unit, working step) — without supplying their content.",
    "Confirm briefly what they already earned so they do not delete correct work.",
    "No markdown headings.",
    "Write equations and symbols as plain readable text with real Unicode characters (°C, °F, ×, ÷, ≠, ≤, ≥, →, π, Δ, m², H₂O, x = (y - b)/m). Never use LaTeX or maths delimiters ($, $$, \\frac, \\(, \\[) and never use code fences.",
    LEVEL_STYLE[level] ?? LEVEL_STYLE["medium"]!,
    language.toLowerCase().startsWith("english")
      ? "Reply in English."
      : `Reply in ${language}. Keep subject-specific exam terms in English inside brackets after the translated term, because the student must write their exam answer in English.`,
    "When their reasoning finally covers the missing point, say so and tell them to add it to their answer and press Re-check answer.",
  ].join(" ");

  const transcript = input.history
    .map((turn) => `${turn.role === "tutor" ? "Tutor" : "Student"}: ${turn.content}`)
    .join("\n");

  const prompt = [
    `Curriculum: ${input.curriculum}`,
    `Subject: ${input.subject || "General"} (${input.marks} marks available)`,
    `Question:\n${input.question}`,
    `PRIVATE mark scheme (never reveal, quote or paraphrase closely — use it only to know which idea is missing):\n${input.markScheme}`,
    input.awardedMarks != null
      ? `Marks currently earned: ${input.awardedMarks} of ${input.marks}.`
      : "Marks currently earned: unknown.",
    earned.length > 0
      ? `Marking points already earned (do not re-teach): ${earned.map((p) => p.point).join("; ")}`
      : "No marking points earned yet.",
    missed.length > 0
      ? `Marking points still missing — focus only on the first of these: ${missed
          .map((p) => `${p.point} (${p.marks} mark${p.marks === 1 ? "" : "s"})`)
          .join("; ")}`
      : "Mark-by-mark breakdown unavailable; infer the missing requirement from the question and the student's answer.",
    `Student's submitted answer:\n${input.studentAnswer}`,
    transcript ? `Conversation so far:\n${transcript}` : "No conversation yet.",
    `Student's latest message:\n${input.latestMessage}`,
  ].join("\n\n");

  const { text } = await generateText({ model: gatewayModel(), system, prompt });
  return text.trim();
}
