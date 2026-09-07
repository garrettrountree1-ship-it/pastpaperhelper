import { generateText } from "ai";

import { gatewayModel } from "./ai-gateway.server";

export type HelpMode = "hint" | "steps";

type HelpTurn = { role: "tutor" | "student"; content: string };

const LEVEL_STYLE: Record<string, string> = {
  beginner:
    "The student is learning English and the subject at the same time. Only very common words, one idea per sentence, 8-10 words per sentence, no idioms. Keep the whole reply under 50 words.",
  medium: "Use clear, plain classroom English and keep the reply under 100 words.",
  advanced:
    "The student is confident. Use accurate subject terminology and expect independent reasoning. Up to 150 words.",
};

/**
 * On-demand help a student can open before or after answering: either one
 * nudge ("give me a hint") or a stepped walk-through ("break it down"). It
 * never gives the answer.
 */
export async function questionHelpStep(input: {
  mode: HelpMode;
  curriculum: string;
  subject: string;
  question: string;
  markScheme: string;
  marks: number;
  studentAnswer?: string | null;
  level?: string;
  language?: string;
  history: HelpTurn[];
  latestMessage: string | null;
}): Promise<string> {
  const level = input.level ?? "medium";
  const language = input.language?.trim() || "English";

  const shared = [
    "You are a subject expert tutor for IGCSE, A-Level and IB students.",
    "You can see the mark scheme privately. NEVER quote it, never state the final answer, value, word, option, name, equation or result, and never write a sentence the student could copy into their answer. If asked for the answer, warmly refuse and teach the idea instead.",
    "Write equations and symbols as plain readable text with real Unicode characters (°C, ×, ÷, ≤, →, Δ, m², H₂O). Never use LaTeX or maths delimiters and never use code fences. No markdown headings.",
    LEVEL_STYLE[level] ?? LEVEL_STYLE["medium"]!,
    language.toLowerCase().startsWith("english")
      ? "Reply in English."
      : `Reply in ${language}, keeping exam terms in English in brackets after the translated term.`,
  ];

  const system = (
    input.mode === "hint"
      ? [
          ...shared,
          "The student pressed 'Give me a hint'. Give exactly ONE small hint: point them at the idea, law, formula type or command word they need, and say what a full-mark answer needs structurally (how many points and what type each is) without supplying the content.",
          "Finish with one short question that gets them moving.",
          "If the student then asks follow-up questions, answer them as hints only — one nudge at a time, still never the answer.",
        ]
      : [
          ...shared,
          "The student pressed 'Break it down step-by-step'. Split the question into a short numbered ladder of small steps (3-6 steps) they can work through themselves.",
          "Present ONE step at a time: state the current step, explain the idea behind it briefly, then ask the student to do that step and reply with their working. Only move to the next step once they have attempted the current one.",
          "Never do a step for them and never reveal any final value or wording from the mark scheme. Praise correct steps and redirect wrong ones with a question.",
          "When the last step is done, tell them to close this window and write their full answer in their own words.",
        ]
  ).join(" ");

  const transcript = input.history
    .map((turn) => `${turn.role === "tutor" ? "Tutor" : "Student"}: ${turn.content}`)
    .join("\n");

  const prompt = [
    `Curriculum: ${input.curriculum}`,
    `Subject: ${input.subject || "General"} (${input.marks} marks available)`,
    `Question:\n${input.question}`,
    `PRIVATE mark scheme (never reveal, quote or paraphrase closely):\n${input.markScheme}`,
    input.studentAnswer?.trim()
      ? `The student's answer so far:\n${input.studentAnswer}`
      : "The student has not written an answer yet.",
    transcript ? `Conversation so far:\n${transcript}` : "No conversation yet.",
    input.latestMessage
      ? `Student's latest message:\n${input.latestMessage}`
      : input.mode === "hint"
        ? "The student has just asked for a first hint."
        : "The student has just asked you to break the question down. Start with step 1.",
  ].join("\n\n");

  const { text } = await generateText({ model: gatewayModel(), system, prompt });
  return text.trim();
}
