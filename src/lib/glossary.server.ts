import { generateText } from "ai";
import { z } from "zod";

import { fastModel } from "./ai-gateway.server";

export type GlossaryTerm = { term: string; translation: string };

/**
 * Word glosses are identical for every student reading the same question or the
 * same tutor sentence, so they are cached in memory and never re-billed while
 * the server instance is warm.
 */
const glossCache = new Map<string, GlossaryTerm[]>();
const GLOSS_CACHE_MAX = 500;

function cachedGloss(key: string): GlossaryTerm[] | undefined {
  return glossCache.get(key);
}

function storeGloss(key: string, terms: GlossaryTerm[]): GlossaryTerm[] {
  if (glossCache.size >= GLOSS_CACHE_MAX) {
    const oldest = glossCache.keys().next().value;
    if (oldest !== undefined) glossCache.delete(oldest);
  }
  glossCache.set(key, terms);
  return terms;
}

const schema = z.object({
  terms: z
    .array(z.object({ term: z.string().min(1), translation: z.string().min(1) }))
    .max(20)
    .default([]),
});

/**
 * Keeps hover glosses to a plain translation: strips trailing definitions,
 * bracketed notes and anything sentence-length that the model may add.
 */
function cleanTerms(terms: GlossaryTerm[]): GlossaryTerm[] {
  return terms
    .map((item) => {
      let translation = item.translation
        .replace(/[（(][^）)]*[）)]/g, "")
        .split(/[;；]|\s[-–—]\s/)[0]!
        .replace(/^\s*(?:means|meaning|definition)\s*[:：]?\s*/i, "")
        .replace(/[。.]\s*$/, "")
        .trim();
      // A translation should never be a sentence-length explanation.
      if (translation.split(/\s+/).length > 6 || translation.length > 40) {
        translation = translation.split(/[,，]/)[0]!.trim();
      }
      return { term: item.term.trim(), translation };
    })
    .filter((item) => item.term.length > 0 && item.translation.length > 0)
    .filter((item) => item.translation.split(/\s+/).length <= 6 && item.translation.length <= 40);
}

/**
 * Key subject words from an exam question with a short Chinese gloss.
 * Only individual words/short phrases — never a translation of the question,
 * so students cannot use it to bypass writing their own English answer.
 */
export async function keywordGlossary(
  questionText: string,
  subject: string,
  language = "Chinese (Simplified)",
): Promise<GlossaryTerm[]> {
  const cacheKey = `q|${language}|${subject}|${questionText.trim()}`;
  const cached = cachedGloss(cacheKey);
  if (cached) return cached;
  const { text } = await generateText({
    model: fastModel(),
    system: [
      "You help English-language-learner students read exam questions in English.",
      "Pick only the words or two-word phrases in the question that are likely to block understanding: subject-specific terms and command words (describe, explain, calculate, state, deduce).",
      "Never translate whole sentences or clauses, never translate the answer, and never add words that are not in the question.",
      `The translation field must be ONLY the direct dictionary translation of that word into ${language} — the equivalent word or short phrase, nothing else.`,
      "Never write a definition, description, explanation, example or extra English text in the translation field. No parentheses, no notes.",
      `Return at most 10 items as JSON: {"terms":[{"term":"exact word from the question","translation":"the word in ${language} only"}]}`,
      "Return JSON only.",
    ].join(" "),
    prompt: `Subject: ${subject || "General science"}\nQuestion:\n${questionText}`,
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  const json = start >= 0 && end > start ? source.slice(start, end + 1) : source;
  try {
    return storeGloss(cacheKey, cleanTerms(schema.parse(JSON.parse(json)).terms));
  } catch {
    return [];
  }
}

/**
 * Same idea for a tutor reply: gloss only the hard subject words the AI tutor
 * used, so an English-language learner can read the coaching itself.
 * Never glosses whole sentences, so it cannot leak an answer in translation.
 */
export async function tutorGlossary(
  tutorText: string,
  subject: string,
  language = "Chinese (Simplified)",
): Promise<GlossaryTerm[]> {
  const cacheKey = `t|${language}|${subject}|${tutorText.trim()}`;
  const cached = cachedGloss(cacheKey);
  if (cached) return cached;
  const { text } = await generateText({
    model: fastModel(),
    system: [
      "You help English-language-learner students read a tutor's feedback written in English.",
      "Pick only single words or two-word phrases from the tutor text that a beginner English learner would not know: subject terms and academic verbs.",
      "Never translate sentences or clauses, never invent words that are not in the text, and never translate more than 8 items.",
      `The translation field must be ONLY the direct dictionary translation of that word into ${language} — the equivalent word or short phrase, never a definition, description or explanation, and no extra English text or parentheses.`,
      `Return JSON only: {"terms":[{"term":"exact word from the text","translation":"the word in ${language} only"}]}`,
    ].join(" "),
    prompt: `Subject: ${subject || "General science"}\nTutor text:\n${tutorText}`,
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  const json = start >= 0 && end > start ? source.slice(start, end + 1) : source;
  try {
    return cleanTerms(schema.parse(JSON.parse(json)).terms);
  } catch {
    return [];
  }
}
