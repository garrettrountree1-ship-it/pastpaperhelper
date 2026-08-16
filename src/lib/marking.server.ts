import { generateText } from "ai";
import { z } from "zod";

import { gatewayModel } from "./ai-gateway.server";

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
};

export async function markStudentAnswer(input: MarkInput): Promise<MarkResult> {
  const images = input.imageUrls ?? [];
  const questionImages = input.questionImageUrls ?? [];
  const prompt = [
    `Curriculum: ${input.curriculum}`,
    `Subject: ${input.subject || "General"}`,
    `Marks available: ${input.marks}`,
    `Question:\n${input.question}`,
    `Official mark scheme:\n${input.markScheme}`,
    `Student typed answer:\n${input.answer || "(none typed)"}`,
    questionImages.length > 0
      ? "The first attached image(s) are the original past-paper page(s) for this question, including any figure, diagram, graph or equation the student is working from."
      : "",
    images.length > 0
      ? `The student also attached ${images.length} photo(s) of handwritten working or a diagram. Read them carefully — that working is part of the answer.`
      : "",
    "Respond with ONLY a JSON object (no markdown fences, no commentary) of exactly this shape:",
    `{"verdict":"correct|partial|incorrect","awardedMarks":number,"feedback":"string","explanation":"string","leadingQuestion":"string","markPoints":[{"point":"string","marks":number,"awarded":true}]}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = [
    "You are an experienced examiner marking IGCSE, A-Level and IB work strictly against the official mark scheme.",
    "Be generous with equivalent wording: a short answer such as a single letter, number, formula or option that matches the mark scheme earns full marks.",
    "Answers may include photos of handwritten maths working, graphs or diagrams; read the images and credit correct working shown there.",
    "Split the mark scheme into its individual marking points exactly as written (each M1/A1/B1 or bullet worth its stated marks) and return them in markPoints with marks for that point and awarded true/false. The sum of the marks of awarded points MUST equal awardedMarks.",
    "Award marks only for points that genuinely match the mark scheme. Never award more than the marks available and never award negative marks.",
    "verdict is 'correct' only when full marks are earned, 'partial' when some marks are earned, 'incorrect' when none are.",
    "ABSOLUTE RULE: when the student has not earned full marks you must NEVER reveal or hint at the correct answer in feedback, explanation or leadingQuestion. Do not state the required value, word, letter, option, formula, equation, name or final result, and never quote or paraphrase the mark scheme wording. Do not give a worked solution or a 'the answer should be...' sentence. The student must keep trying until they reach it themselves.",
    "feedback: at most 3 short sentences, addressed to the student, naming only which marking points were credited (generically) and that something is still missing — without saying what the missing content is.",
    "explanation: when marks are missing, write 50-100 words explaining WHY the student's reasoning is wrong or incomplete and which concept they appear to have misunderstood, in general terms only, with no correct values, no correct terminology from the mark scheme and no worked steps. If full marks are earned, set explanation to an empty string.",
    "leadingQuestion: one short Socratic question that probes the most likely misunderstanding, phrased so that answering it does not require you to have given the answer away. If the answer is fully correct, leave leadingQuestion as an empty string.",
    "Output raw JSON only.",
  ].join(" ");

  const asImage = (url: string) =>
    ({ type: "image" as const, image: url.startsWith("data:") ? url : new URL(url) });

  const content = [
    { type: "text" as const, text: prompt },
    ...questionImages.map(asImage),
    ...images.map(asImage),
  ];


  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { text } = await generateText({
        model: gatewayModel(),
        system,
        messages: [{ role: "user", content }],
      });
      const parsed = markSchema.parse(JSON.parse(extractJson(text)));
      return clamp(parsed, input.marks);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `We couldn't mark that answer just now. Please try again. (${
      lastError instanceof Error ? lastError.message : "unknown error"
    })`,
  );
}

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
      ? result.feedback.trim() || "Well done — your answer earns full marks."
      : "Your answer does not earn full marks yet. It may use an idea that does not fully fit what the question is asking, or it may not show enough reasoning to support the conclusion. Re-read the command word and check each part of your response against the information given before trying again.",
    explanation: "",
    leadingQuestion: isCorrect
      ? ""
      : "What is the question asking you to determine, and what evidence or method should support your response?",
    markPoints: (result.markPoints ?? []).map((p) => ({
      point: p.point.trim(),
      marks: Math.max(0, Math.min(maxMarks, p.marks)),
      awarded: Boolean(p.awarded),
    })),
  };
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
};

export async function tutorStep(input: TutorInput): Promise<string> {
  const system = [
    "You are a patient Socratic tutor for IGCSE, A-Level and IB students. You know the official mark scheme but you must NEVER state the final answer, the required value/word/option, or quote or paraphrase the mark scheme — no matter how many times, or how directly, the student asks. If the student asks for the answer, kindly refuse and ask a guiding question instead.",
    "Your job: diagnose the student's knowledge gap with one short leading question at a time.",
    "Once you can see where the misunderstanding is, break the problem into the smallest possible next step and ask the student to do only that step.",
    "Answer the student's genuine follow-up questions about the underlying concept, definitions or method in general terms, using a different example than the question itself when you need to illustrate something.",
    "Reply with at most 3 short sentences and exactly one question. Confirm what the student got right before nudging.",
    "When the student has worked all the way to a correct understanding, congratulate them briefly and tell them to re-submit their improved answer.",
  ].join(" ");

  const transcript = input.history
    .map((turn) => `${turn.role === "tutor" ? "Tutor" : "Student"}: ${turn.content}`)
    .join("\n");

  const prompt = [
    `Curriculum: ${input.curriculum}`,
    `Subject: ${input.subject || "General"} (${input.marks} marks)`,
    `Question:\n${input.question}`,
    `Official mark scheme (never reveal):\n${input.markScheme}`,
    `Student's submitted answer:\n${input.studentAnswer}`,
    transcript ? `Conversation so far:\n${transcript}` : "No conversation yet.",
    `Student's latest message:\n${input.latestMessage}`,
  ].join("\n\n");

  const { text } = await generateText({ model: gatewayModel(), system, prompt });
  return text.trim();
}
