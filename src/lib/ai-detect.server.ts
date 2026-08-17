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

/** Obvious chatbot giveaways — instant flag, no model call needed. */
const HARD_PATTERNS: RegExp[] = [
  /\bas an ai\b/i,
  /\bas a language model\b/i,
  /\bi'?m an ai\b/i,
  /\bchatgpt\b/i,
  /\bopenai\b/i,
  /\bgemini\b|\bdeepseek\b|\bcopilot\b|\bclaude\b/i,
  /\bcertainly!/i,
  /\bgreat question!/i,
  /^\s*sure[,!]/i,
  /\bhere'?s (a|the) (step-by-step|breakdown|explanation)\b/i,
  /\blet'?s break (this|it) down\b/i,
  /\bi hope this helps\b/i,
  /\bin summary\b|\bin conclusion\b/i,
  /\bit'?s important to note\b|\bit is worth noting\b/i,
  /\bkey (takeaways?|points?):/i,
  /\*\*[^*]+\*\*/,
  /^\s*(step\s*\d+[:.]|\d+\.\s+\*\*)/im,
];

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Detects answers copied out of a chatbot or search result. Short answers
 * (a letter, number or one-liner) are never flagged — they cannot be judged.
 */
export async function detectAiAnswer(input: {
  question: string;
  answer: string;
  marks: number;
}): Promise<AiDetection> {
  const answer = input.answer.trim();
  const words = wordCount(answer);
  if (words < 12) return { isAi: false, confidence: 0, reason: "" };

  const hard = HARD_PATTERNS.find((pattern) => pattern.test(answer));
  if (hard) {
    return {
      isAi: true,
      confidence: 0.95,
      reason: "The answer contains chatbot-style phrasing or formatting.",
    };
  }

  const system = [
    "You detect whether a school student's exam answer was written by the student or copied from an AI chatbot (ChatGPT, Gemini, DeepSeek) or a web page.",
    "Signals of copied AI/web text: essay-length answers far beyond the marks available, polished textbook prose, markdown headings/bold/bulleted lists, hedging phrases, generic definitions and framing not asked for, 'firstly/moreover/in conclusion' scaffolding, perfect spelling and punctuation with em dashes, restating the question before answering.",
    "Signals of genuine student work: exam shorthand, terse mark-scheme style points, small slips, abbreviations, units written inline, working shown, informal wording.",
    "Be conservative: only report isAi true when several signals are present. Never flag a short factual answer just for being correct.",
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
      isAi: parsed.isAi && confidence >= 0.75,
      confidence,
      reason: parsed.reason.trim(),
    };
  } catch {
    // Detection must never block honest work.
    return { isAi: false, confidence: 0, reason: "" };
  }
}
