import { generateText } from "ai";
import { z } from "zod";

import { gatewayModel } from "./ai-gateway.server";

export type GlossaryTerm = { term: string; translation: string };

const schema = z.object({
  terms: z
    .array(z.object({ term: z.string().min(1), translation: z.string().min(1) }))
    .max(20)
    .default([]),
});

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
  const { text } = await generateText({
    model: gatewayModel(),
    system: [
      "You help English-language-learner students read exam questions in English.",
      "Pick only the words or two-word phrases in the question that are likely to block understanding: subject-specific terms and command words (describe, explain, calculate, state, deduce).",
      "Never translate whole sentences or clauses, never translate the answer, and never add words that are not in the question.",
      `Return at most 10 items as JSON: {"terms":[{"term":"exact word from the question","translation":"very short gloss in ${language}"}]}`,
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
    return schema.parse(JSON.parse(json)).terms;
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
  const { text } = await generateText({
    model: gatewayModel(),
    system: [
      "You help English-language-learner students read a tutor's feedback written in English.",
      "Pick only single words or two-word phrases from the tutor text that a beginner English learner would not know: subject terms and academic verbs.",
      "Never translate sentences or clauses, never invent words that are not in the text, and never translate more than 8 items.",
      `Return JSON only: {"terms":[{"term":"exact word from the text","translation":"very short gloss in ${language}"}]}`,
    ].join(" "),
    prompt: `Subject: ${subject || "General science"}\nTutor text:\n${tutorText}`,
  });

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  const json = start >= 0 && end > start ? source.slice(start, end + 1) : source;
  try {
    return schema.parse(JSON.parse(json)).terms;
  } catch {
    return [];
  }
}
