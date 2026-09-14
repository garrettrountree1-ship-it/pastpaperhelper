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
  /\bin (other words|essence|general)\b/i,
  /\bthis (demonstrates|indicates|suggests|shows) that\b/i,
  /\bhence,?\s|\bthus,?\s|\btherefore,?\s/i,
  /\bwhich (is|are|means|results in|leads to) \w+/i,
  /\bas a result\b|\bfor instance\b|\bfor example,\s/i,
  /\bkey (point|idea|concept)s?\b/i,
  /\bstep \d\b/i,
  /\brefers to\b|\bis defined as\b|\bis known as\b/i,
  /\bensur(e|ing|es) that\b/i,
  /\bthe (process|value|result|concept) of \w+/i,
  /\bsince the \w+ (is|are)\b/i,
  /\bnote that\b/i,
  /\bboth \w+ and \w+ (are|have|share)\b/i,
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

/** True when the answer is essentially maths/working rather than prose. */
function isCalculation(text: string) {
  const stripped = text.replace(/\s+/g, " ").trim();
  if (!stripped) return true;
  const mathChars = (stripped.match(/[0-9+\-*/=^×÷·√%°()<>.,:]/g) ?? []).length;
  const letters = (stripped.match(/[a-z]/gi) ?? []).length;
  if (mathChars >= letters) return true;
  const words = wordCount(stripped);
  if (/=/.test(stripped) && words < 60) return true;
  return false;
}

/**
 * Detects answers that are clearly not the student's own writing. Deliberately
 * conservative: calculations and working are never checked, and only long prose
 * blocks (25+ words) that both look and read as generated are flagged.
 */
export async function detectAiAnswer(input: {
  question: string;
  answer: string;
  marks: number;
}): Promise<AiDetection> {
  const answer = input.answer.trim();
  const words = wordCount(answer);

  // Calculations and numeric working are always accepted.
  if (isCalculation(answer)) return { isAi: false, confidence: 0, reason: "" };

  const hard = HARD_PATTERNS.find((pattern) => pattern.test(answer));
  if (hard) {
    return {
      isAi: true,
      confidence: 0.95,
      reason: "The answer contains chatbot boilerplate phrasing.",
    };
  }

  // Only substantial prose blocks are examined at all.
  if (words < 25) return { isAi: false, confidence: 0, reason: "" };

  const style = styleScore(answer);
  // Weak surface evidence: accept without troubling the model.
  if (style < 4) return { isAi: false, confidence: 0, reason: "" };

  const system = [
    "You judge whether a school student's exam answer was pasted from an AI chatbot or a paraphrasing tool.",
    "Be conservative: only say yes when the writing is unmistakably machine-generated — a tutorial voice explaining to the reader, bulleted lists of full explanatory sentences, markdown bold, padding such as 'it is important to note', or an answer far longer and more polished than the marks require.",
    "Never flag an answer for being correct, concise, neat, well-punctuated, or for using subject terminology. Never flag calculations, formulae, or mark-scheme style points. When in doubt, say it is the student's own work.",
    'Reply with ONLY raw JSON: {"isAi":boolean,"confidence":0-1,"reason":"one short sentence for the student explaining what looked unoriginal"}',
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
      // Both the surface markers and the model must be strongly convinced.
      isAi: parsed.isAi && confidence >= 0.85,
      confidence,
      reason:
        parsed.reason.trim() || "The answer does not read as the student's own writing.",
    };
  } catch {
    // Model unavailable: never flag on surface markers alone.
    return { isAi: false, confidence: 0, reason: "" };
  }
}
