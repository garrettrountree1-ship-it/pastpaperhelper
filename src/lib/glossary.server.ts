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
): Promise<GlossaryTerm[]> {
  const { text } = await generateText({
    model: gatewayModel(),
    system: [
      "You help English-language-learner students read exam questions in English.",
      "Pick only the words or two-word phrases in the question that are likely to block understanding: subject-specific terms and command words (describe, explain, calculate, state, deduce).",
      "Never translate whole sentences or clauses, never translate the answer, and never add words that are not in the question.",
      "Return at most 10 items as JSON: {\"terms\":[{\"term\":\"exact word from the question\",\"translation\":\"Simplified Chinese, 1-6 characters\"}]}",
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
