import { streamText } from "ai";

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
 * keeps hints answer-free and reveals the answer only at the end of steps mode.
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
          "You can see the mark scheme privately. NEVER quote it, never state the final answer, value, word, option, name, equation or result, and never write a sentence the student could copy into their answer. If asked for the answer, warmly refuse and teach the idea instead.",
          "The student pressed 'Give me a hint'. Your FIRST reply must be the hint itself: start immediately with the hint, no greeting and no 'let me help you'. Point them at the idea, law, formula type or command word they need, and say what a full-mark answer needs structurally (how many points and what type each is) without supplying the content.",
          "Finish with one short question that gets them moving.",
          "If the student then asks follow-up questions, answer them as hints only — one nudge at a time, still never the answer.",
        ]
      : [
          ...shared,
          "The student pressed 'Break it down step-by-step'. You are running a fixed ladder of small steps that leads to the answer.",
          "On your FIRST reply: decide how many steps this question needs (choose between 2 and 5 — simple questions get 2, multi-part or multi-stage calculations get up to 5). Begin with one short line 'This question breaks into N steps.' then immediately give 'Step 1 of N:' — a very short explanation of the idea for that step followed by ONE simple question the student can answer easily. Nothing else. Do not list the later steps.",
          "On every later reply: respond to what the student just wrote (praise if right, gently correct if wrong, never scold), then give the next step in the same format 'Step k of N:' with one simple question. Only one step per reply.",
          "The LAST step is different: after the student has attempted it, give the complete correct answer to the original exam question, written out fully so they understand it, and label it clearly as 'The answer:'. Then say plainly that this window does not give them marks and they must close it and type the answer in their own words in the answer box to get credit.",
          "Never jump ahead, never give the final answer before the last step, and never quote the mark scheme wording verbatim.",
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

  const result = streamText({ model: gatewayModel(), system, prompt });
  const text = await result.text;
  const reply = text.trim();
  if (!reply) throw new Error("The tutor returned an empty reply. Please try again.");
  return reply;
}
