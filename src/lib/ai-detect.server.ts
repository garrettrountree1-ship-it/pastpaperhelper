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
  /\bfirstly\b|\bmoreover\b|\bfurthermore\b|\badditionally\b|\boverall,/i,
  /\bthis (means|is because) that\b|\bplays? a (crucial|vital|key) role\b/i,
  /\bthe (process|reaction) (can be described|occurs) as follows\b/i,
  /\bis defined as\b.*\bwhich\b/i,
  /\bin other words\b|\bto put it simply\b|\bthink of it as\b/i,
  /\bnote that\b|\bkeep in mind\b|\bremember that\b/i,
  /—/,
  /\bwikipedia\b|\bbyju|\bsave my exams\b|\bstudy ?smarter\b|\bcourse ?hero\b|\bquizlet\b/i,
];

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const PROCEDURE_VERBS =
  "add|apply|choose|combine|compare|connect|describe|explain|heat|identify|insert|measure|mix|observe|place|pour|record|remove|select|state|test|use|write";

/**
 * Short search-result answers often omit chatbot catchphrases but retain a
 * polished, instructional sequence (for example, "Use … . Add … ."). That
 * style is unusual in a student's terse exam response and is safe to reject
 * under this app's deliberately strict integrity policy.
 */
function looksLikeCopiedShortProcedure(answer: string, words: number) {
  if (words < 8) return false;
  const imperative = new RegExp(`(?:^|[.!?]\\s+)(?:${PROCEDURE_VERBS})\\b`, "gi");
  const commands = answer.match(imperative)?.length ?? 0;
  const sentences = answer.split(/[.!?]+(?:\s+|$)/).filter((part) => part.trim()).length;
  return commands >= 2 || (commands >= 1 && sentences >= 2 && words >= 12);
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

  if (looksLikeCopiedShortProcedure(answer, words)) {
    return {
      isAi: true,
      confidence: 0.92,
      reason: "The answer uses polished, search-result-style instructional steps rather than student exam wording.",
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
