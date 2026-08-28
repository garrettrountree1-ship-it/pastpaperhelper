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
 * Detects answers pasted straight out of a chatbot. Deliberately conservative:
 * a well-written, well-punctuated or textbook-sounding answer is NOT evidence of
 * cheating, so only clearly chatbot-shaped responses are flagged. Anything
 * shorter than a long paragraph is left alone unless it names the chatbot.
 */
export async function detectAiAnswer(input: {
  question: string;
  answer: string;
  marks: number;
}): Promise<AiDetection> {
  const answer = input.answer.trim();
  const words = wordCount(answer);

  const hard = HARD_PATTERNS.find((pattern) => pattern.test(answer));
  if (hard) {
    return {
      isAi: true,
      confidence: 0.95,
      reason: "The answer contains chatbot boilerplate phrasing.",
    };
  }

  // Real exam answers are short. Only long, essay-shaped responses are checked.
  if (words < 60) return { isAi: false, confidence: 0, reason: "" };

  const system = [
    "You check whether a school student's exam answer was pasted from an AI chatbot such as ChatGPT, Gemini, DeepSeek or Copilot.",
    "Your default answer is NO. A false accusation is far worse than a missed one: only flag text that is unmistakably chatbot output.",
    "Flag ONLY when several of these appear together: chatbot boilerplate or sign-off phrasing; a tutorial-style answer that teaches the reader instead of answering the question; headed sections or markdown bullets with bold labels; a long generic essay far beyond the marks available; repeated 'it is important to note' style padding; an assistant voice addressing the reader ('you can see that…', 'let me explain').",
    "NEVER flag an answer for being well written, correct, fluent, textbook-sounding, fully punctuated, grammatical, definition-shaped, long, or for using em dashes, connectives such as 'furthermore', or standard scientific phrasing. Teachers and strong students write like that.",
    "Never flag exam shorthand, mark-scheme style points, formulae, equations, calculations, transcribed handwriting, or restating the question.",
    "Use a confidence of 0.9 or more only when you would stake the student's grade on it.",
    'Reply with ONLY raw JSON: {"isAi":boolean,"confidence":0-1,"reason":"one short sentence for the teacher"}',
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
      isAi: parsed.isAi && confidence >= 0.85,
      confidence,
      reason: parsed.reason.trim(),
    };
  } catch {
    // Detection must never block honest work.
    return { isAi: false, confidence: 0, reason: "" };
  }
}
