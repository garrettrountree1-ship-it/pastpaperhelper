import { generateText } from "ai";

import { gatewayModel } from "./ai-gateway.server";

export type FormativeVerdict = "correct" | "close" | "incorrect";

/**
 * Marks a quick in-lesson class question. Encouraging by design: a wrong answer
 * gets warm, specific coaching (never a bare "not yet") and never the answer.
 */
export async function markFormativeAnswer(input: {
  question: string;
  expectedAnswer?: string | null;
  answer: string;
  attempt: number;
}): Promise<{ verdict: FormativeVerdict; feedback: string }> {
  const system = [
    "You mark a quick formative check during a live lesson.",
    "Be generous: accept correct science expressed in the student's own words, with spelling slips or missing units, as correct.",
    input.expectedAnswer?.trim()
      ? "The teacher supplied the expected answer — mark against it."
      : "No expected answer was supplied — work out the correct answer yourself from the question, then mark against it.",
    "Never state or hint the final answer in your feedback.",
    "Tone: warm, specific and encouraging. Praise what the student got right first.",
    "If the answer is wrong or partly right, name the idea to rethink and give one concrete nudge, in an upbeat voice (e.g. 'Great start — you've spotted ...; now think about ...'). Never write a bare 'not yet'.",
    "If it is correct, celebrate enthusiastically in one short sentence.",
    'Reply as strict JSON only: {"verdict":"correct"|"close"|"incorrect","feedback":"..."} with feedback under 45 words.',
  ].join("\n");

  const prompt = [
    `Question: ${input.question}`,
    input.expectedAnswer?.trim() ? `Expected answer: ${input.expectedAnswer.trim()}` : "",
    `Student answer (attempt ${input.attempt}): ${input.answer}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { text } = await generateText({ model: gatewayModel(), system, prompt });
  const raw = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(raw) as { verdict?: string; feedback?: string };
    const verdict: FormativeVerdict =
      parsed.verdict === "correct" ? "correct" : parsed.verdict === "close" ? "close" : "incorrect";
    return {
      verdict,
      feedback:
        parsed.feedback?.trim() ||
        (verdict === "correct"
          ? "Brilliant — spot on!"
          : "Good thinking so far — read the question once more and try another angle."),
    };
  } catch {
    return {
      verdict: "incorrect",
      feedback: "Nice effort — have another go and add a little more detail to your reasoning.",
    };
  }
}
