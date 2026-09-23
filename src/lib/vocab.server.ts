import { generateText } from "ai";
import { z } from "zod";

import { fastModel } from "./ai-gateway.server";

export type VocabItem = {
  term: string;
  translation: string;
  kind: "word" | "concept";
  short: string;
};

const listSchema = z.object({
  items: z
    .array(
      z.object({
        term: z.string().min(1),
        translation: z.string().min(1),
        kind: z.enum(["word", "concept"]).default("word"),
        short: z.string().default(""),
      }),
    )
    .max(40)
    .default([]),
});

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? source.slice(start, end + 1) : source);
}

/**
 * Key vocabulary and concepts across a whole homework, each translated into the
 * teacher's chosen language. Single words and short concept phrases only — never
 * translated sentences, so it can't be used to bypass writing English answers.
 */
export async function assignmentVocab(
  questionTexts: string[],
  subject: string,
  language: string,
): Promise<VocabItem[]> {
  const { text } = await generateText({
    model: fastModel(),
    system: [
      "You build a study vocabulary list for exam homework.",
      "Pick the key subject terms, command words (describe, explain, calculate, deduce) and the big concepts a student must understand to answer these questions.",
      "Items are single words or short phrases of at most 4 words. Never include sentences, never include any part of an answer, and never reveal answers.",
      `Translate ONLY the term into ${language} (a word or two, never a sentence, never the hint). If ${language} is English, put a very simple English synonym instead.`,
      'Return JSON only: {"items":[{"term":"exact English term","translation":"...","kind":"word|concept","short":"max 12 word plain-English hint that does not give the answer"}]}',
      "Return at most 24 items, most important first, no duplicates.",
    ].join(" "),
    prompt: `Subject: ${subject || "General science"}\nLanguage: ${language}\nQuestions:\n${questionTexts
      .map((q, index) => `${index + 1}. ${q}`)
      .join("\n")}`,
  });

  try {
    const items = listSchema.parse(parseJson(text)).items;
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.term.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

const explainSchema = z.object({
  translation: z.string().default(""),
  explanation: z.string().min(1),
  imageQueries: z.array(z.string().min(2)).max(3).default([]),
});

/** Free, licence-safe illustrative pictures for a term (Wikipedia/Wikimedia). */
async function pictureUrls(queries: string[]): Promise<string[]> {
  const urls: string[] = [];
  for (const query of queries.slice(0, 3)) {
    try {
      const endpoint =
        "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
        "&generator=search&gsrlimit=3&prop=pageimages&piprop=thumbnail&pithumbsize=800" +
        `&gsrsearch=${encodeURIComponent(query)}`;
      const response = await fetch(endpoint, {
        headers: { "User-Agent": "STEM-Homework-AI/1.0 (vocab illustrations)" },
      });
      if (!response.ok) continue;
      const json = (await response.json()) as {
        query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
      };
      for (const page of Object.values(json.query?.pages ?? {})) {
        const source = page.thumbnail?.source;
        if (source && !urls.includes(source)) urls.push(source);
        if (urls.length >= 3) return urls;
      }
    } catch {
      // A missing picture must never break the explanation.
    }
  }
  return urls;
}

/**
 * In-depth, level-appropriate explanation of one vocabulary item, in the
 * teacher's language, together with illustrative pictures.
 */
export async function explainVocab(
  term: string,
  subject: string,
  language: string,
  level: "beginner" | "medium" | "advanced",
): Promise<{ translation: string; explanation: string; imageUrls: string[] }> {
  const levelRule =
    level === "beginner"
      ? "Use very simple A2-B1 sentences, under 90 words, and one everyday example."
      : level === "advanced"
        ? "Use precise technical language, under 180 words, and include why it matters in exam answers."
        : "Use clear exam-level language, under 130 words, with one worked example.";

  const { text } = await generateText({
    model: fastModel(),
    system: [
      "You explain one science/maths vocabulary word or concept to a student doing homework.",
      levelRule,
"Write the whole explanation in very simple English. Never translate the explanation, definition or examples — only the single term itself is translated.",
      "Never state the answer to any homework question — explain the idea only.",
      'Also give 1-3 short English search phrases for a diagram or photo that illustrates the idea (e.g. "photosynthesis diagram").',
      'Return JSON only: {"translation":"just the term itself in the target language, a few words at most","explanation":"simple English only","imageQueries":["..."]}',
    ].join(" "),
    prompt: `Subject: ${subject || "General science"}\nTerm: ${term}\nTarget language: ${language}`,
  });

  let parsed: z.infer<typeof explainSchema>;
  try {
    parsed = explainSchema.parse(parseJson(text));
  } catch {
    parsed = { translation: "", explanation: text.trim(), imageQueries: [term] };
  }

  const imageUrls = await pictureUrls(
    parsed.imageQueries.length > 0 ? parsed.imageQueries : [`${term} ${subject} diagram`],
  );

  return { translation: parsed.translation, explanation: parsed.explanation, imageUrls };
}
