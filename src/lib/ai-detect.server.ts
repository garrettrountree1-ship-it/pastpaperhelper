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

/** Unmistakable chatbot giveaways — flagged without asking the model. */
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

/**
 * Register markers typical of generated or paraphrase-tool prose: inflated
 * noun phrases and hedged passive constructions students do not write under
 * exam conditions. Each one is a signal, not a verdict.
 */
const STYLE_PATTERNS: RegExp[] = [
  /\bthe (quantit(y|ies)|number|amount) of \w+ (is|are|could|can|would) \w+/i,
  /\bcould be (inferred|deduced|determined|calculated|obtained|derived)\b/i,
  /\bcan be (inferred|deduced|determined|obtained|derived)\b/i,
  /\bis (equivalent|equal) to the (number|quantity|amount)\b/i,
  /\b(inside|under|in) the (condition|circumstance|context) of\b/i,
  /\bit is (important|worth|essential|crucial) to (note|remember|mention)\b/i,
  /\bplays? a (crucial|vital|significant|key) role\b/i,
  /\bin (conclusion|summary),/i,
  /\bthis (is|means) (because|that) the \w+ \w+ (is|are)\b/i,
  /\bby (subtracting|adding|dividing|multiplying) the (number|quantit(y|ies)|amount)\b/i,
  /\bfurthermore\b|\bmoreover\b|\badditionally\b|\bconsequently\b/i,
  /\brespectively\b/i,
  /\boverall,\s/i,
  /\*\*[^*]+\*\*/,
];

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Bullet / numbered list of full sentences — a generated answer shape. */
function bulletedProse(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bullets = lines.filter((line) => /^([•\-*\u2022]|\d+[.)])\s+/.test(line));
  if (bullets.length < 2) return false;
  return bullets.filter((line) => wordCount(line) >= 12).length >= 2;
}

/** Counts the surface signals that make an answer look unoriginal. */
function styleScore(answer: string) {
  const hits = STYLE_PATTERNS.filter((pattern) => pattern.test(answer)).length;
  let score = hits;
  if (bulletedProse(answer)) score += 2;
  // Long, uniformly punctuated multi-clause sentences.
  const sentences = answer.split(/[.!?]\s+/).filter((s) => wordCount(s) >= 4);
  const long = sentences.filter((s) => wordCount(s) >= 18).length;
  if (long >= 2) score += 1;
  return score;
}

/**
 * Detects answers that are not the student's own writing — pasted from a
 * chatbot, run through a paraphraser, or lifted from a source. Genuine
 * exam-style working (mark-scheme points, formulae, calculations, terse notes)
 * stays accepted; polished explanatory prose in a generated register does not.
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

  // Very short answers are exam shorthand; nothing to judge.
  if (words < 20) return { isAi: false, confidence: 0, reason: "" };

  const style = styleScore(answer);

  // Overwhelming surface evidence: flag without waiting on the model.
  if (style >= 5 && words >= 35) {
    return {
      isAi: true,
      confidence: 0.9,
      reason:
        "The answer is written in a generated, textbook-style register (listed full-sentence explanations and formulaic phrasing) rather than in the student's own words.",
    };
  }

  const system = [
    "You judge whether a school student's exam answer is their own original writing or whether it came from an AI chatbot (ChatGPT, Gemini, DeepSeek, Copilot), a paraphrasing tool, or was copied from a source.",
    "Flag it when the writing is not plausibly the student's own, even when the science is correct and even when there are small grammar slips — paraphrasing tools leave awkward grammar behind.",
    "Signals of generated or copied writing: bulleted or numbered lists of complete explanatory sentences; inflated noun phrases such as 'the quantities of electrons is equivalent to the number of protons'; hedged passives such as 'could be inferred by'; framing clauses such as 'inside the condition of a neutral atom'; restating the answer after the calculation; a tutorial voice that explains to the reader; uniform long multi-clause sentences; padding such as 'it is important to note'; markdown bold; an answer far longer or more polished than the marks require.",
    "Signals of genuine student writing: terse mark-scheme style points; bare formulae and calculations; abbreviations and symbols; simple direct sentences; transcribed handwriting; minor untidiness with no inflated register.",
    "Do NOT flag an answer only because it is correct, or only because it is short and neat, or only because it uses a subject term correctly.",
    "Judge the writing, not the physics. Set isAi true whenever the register is generated or copied.",
    'Reply with ONLY raw JSON: {"isAi":boolean,"confidence":0-1,"reason":"one short sentence for the student explaining what looked unoriginal"}',
  ].join(" ");

  const prompt = [
    `Marks available: ${input.marks}`,
    `Question:\n${input.question}`,
    `Student answer (${words} words):\n${answer}`,
    style > 0
      ? `Automated style analysis found ${style} generated-writing marker${style === 1 ? "" : "s"} in this answer.`
      : "Automated style analysis found no generated-writing markers.",
  ].join("\n\n");

  try {
    const { text } = await generateText({ model: gatewayModel(), system, prompt });
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = schema.parse(JSON.parse(text.slice(start >= 0 ? start : 0, end + 1)));
    // Surface markers raise the model's confidence; the threshold is strict but
    // no longer needs near-certainty from the classifier alone.
    const confidence = Math.max(0, Math.min(1, parsed.confidence + style * 0.06));
    const threshold = style >= 3 ? 0.45 : style >= 1 ? 0.55 : 0.65;
    return {
      isAi: parsed.isAi && confidence >= threshold,
      confidence,
      reason:
        parsed.reason.trim() ||
        "The answer does not read as the student's own writing.",
    };
  } catch {
    // Model unavailable: fall back to the surface markers alone.
    if (style >= 4 && words >= 30) {
      return {
        isAi: true,
        confidence: 0.75,
        reason:
          "The answer is written in a generated, textbook-style register rather than in the student's own words.",
      };
    }
    return { isAi: false, confidence: 0, reason: "" };
  }
}
