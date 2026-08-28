import { generateText } from "ai";
import { z } from "zod";

import { gatewayModel } from "./ai-gateway.server";

export type AiDetection = {
  isAi: boolean;
  confidence: number;
  reason: string;
};

const schema = z.object({
  isAi: z.coerce.boolean(),
  confidence: z.coerce.number(),
  reason: z.string().default(""),
});

/**
 * Only unmistakable chatbot giveaways are auto-flagged. Ordinary good writing —
 * em dashes, "in summary", bullet formatting, correct punctuation — is NOT
 * evidence of AI use and must never be rejected on its own.
 */
const HARD_PATTERNS: RegExp[] = [
  /\bas an ai\b/i,
  /\bas a language model\b/i,
  /\bi'?m an ai\b/i,
  /\bi am an ai\b/i,
  /\bchatgpt\b/i,
  /\bopenai\b/i,
  /\bas requested,? here\b/i,
  /\bhere'?s (a|the) (step-by-step|breakdown)\b/i,
  /\bi hope this helps\b/i,
  /\blet me know if you (need|have) (any )?(more|other|further)\b/i,
  /\bwould you like me to\b/i,
  /\b(sure|certainly|of course)[,!]\s+(here|i)\b/i,
];

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Detects answers copied out of a chatbot or search result. Irreducibly short
 * answers (a letter, number, formula or a few words) pass because authorship
 * cannot be judged from them; complete one-sentence answers are still checked.
 */
export async function detectAiAnswer(input: {
  question: string;
  answer: string;
  marks: number;
}): Promise<AiDetection> {
  const answer = input.answer.trim();
  const words = wordCount(answer);
  if (words < 5) return { isAi: false, confidence: 0, reason: "" };

  const hard = HARD_PATTERNS.find((pattern) => pattern.test(answer));
  if (hard) {
    return {
      isAi: true,
      confidence: 0.95,
      reason: "The answer contains chatbot-style phrasing or formatting.",
    };
  }

  const system = [
    "You are a plagiarism and AI-detection examiner. Decide whether a school student's exam answer is original student writing, or non-original text copied from any source: an AI chatbot (ChatGPT, Gemini, DeepSeek, Copilot), a Google AI Overview or featured snippet, a revision or homework-help website (Save My Exams, BYJU'S, Quizlet, Course Hero, Chegg, Brainly, Physics & Maths Tutor), a textbook, a published mark scheme or model answer, a teacher's notes, or another student.",
    "A copied answer can be ONE short sentence. Do not treat brevity as proof that it is original. Judge whether the exact wording reads as published prose rather than a student's own words.",
    "Signals of non-original text: polished textbook or teacher prose; complete instructional sentences; a compact sequence such as 'Use X. Add Y and observe Z'; definition-style phrasing ('X is the process by which…'); wording that sounds ready to publish; essay-length answers beyond the marks available; markdown; hedging; generic framing; connective scaffolding; perfect punctuation and grammar throughout; or restating the question.",
    "Signals of genuine student work: exam shorthand, terse mark-scheme style points, small slips, abbreviations, units written inline, working shown, informal wording.",
    "This school uses a deliberately strict policy because suspected copied work must be rewritten. Flag likely non-original wording decisively even when it is only 5-25 words and has no explicit chatbot phrase. A polished full-sentence answer should not pass merely because it is concise.",
    "Pass genuinely terse exam shorthand, rough student phrasing, letters, numbers, formulae, chemical equations, brief labels, and handwriting-transcribed maths working. Never flag an answer merely for being correct; flag its source-like wording and presentation.",
    'Reply with ONLY raw JSON: {"isAi":boolean,"confidence":0-1,"reason":"one short sentence for the teacher naming the likely source type"}',
  ].join(" ");


  const prompt = [
    `Marks available: ${input.marks}`,
    `Question:\n${input.question}`,
    `Student answer (${words} words):\n${answer}`,
  ].join("\n\n");

  try {
    const { text } = await generateText({ model: gatewayModel(), system, prompt });
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = schema.parse(JSON.parse(text.slice(start >= 0 ? start : 0, end + 1)));
    const confidence = Math.max(0, Math.min(1, parsed.confidence));
    return {
      isAi: parsed.isAi && confidence >= 0.4,
      confidence,
      reason: parsed.reason.trim(),
    };
  } catch {
    // Detection must never block honest work.
    return { isAi: false, confidence: 0, reason: "" };
  }
}
