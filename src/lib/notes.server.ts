import { generateText } from "ai";

import { gatewayModel } from "./ai-gateway.server";

/**
 * Builds an AI study summary that is strictly limited to what the teacher wrote
 * on the lesson canvas — key concepts, vocabulary and worked examples only.
 */
export async function summariseTeacherNotes(input: {
  unitTitle: string;
  sectionTitle: string;
  subject: string;
  notesText: string;
}): Promise<string> {
  const notes = input.notesText.trim();
  if (notes.length < 20) return "";

  const system = [
    "You organise a teacher's live lesson notes into a clean study summary for students.",
    "Use ONLY the content the teacher wrote. Never add facts, examples or vocabulary that are not in the notes.",
    "If a section has nothing in the notes, omit that section entirely.",
    "Write in clear British English, plain text with simple markdown headings and bullets.",
    "Structure (only the parts that apply):",
    "## Key concepts",
    "## Vocabulary",
    "## Worked examples",
    "## Things to remember",
    "Keep it tight: no filler, no introductions, no closing remarks.",
  ].join("\n");

  const prompt = [
    `Subject: ${input.subject}`,
    `Unit: ${input.unitTitle}`,
    `Section: ${input.sectionTitle}`,
    "",
    "Teacher's notes:",
    notes,
  ].join("\n");

  const { text } = await generateText({ model: gatewayModel(), system, prompt });
  return text.trim();
}

export type TutorTurn = { role: "user" | "assistant"; content: string };

/**
 * Always-on lesson tutor. It never dumps an answer: every reply ends with a
 * leading question that probes for the learning gap.
 */
export async function lessonTutorReply(input: {
  question: string;
  concept?: string | null;
  contextNotes: string;
  documentTitle?: string | null;
  subject: string;
  unitTitle: string;
  language: string;
  level: string;
  isTeacher: boolean;
  history: TutorTurn[];
}): Promise<string> {
  const levelRule =
    input.level === "beginner"
      ? "Very simple English, short sentences, one small step at a time (max 70 words)."
      : input.level === "advanced"
        ? "Technical, exam-level language; expect independent reasoning (max 140 words)."
        : "Clear exam-style coaching (max 110 words).";

  const system = [
    "You are the in-class AI tutor for a past-paper study app, used live during lessons.",
    "Ground every answer in the teacher's notes and the lesson topic supplied below.",
    "NEVER give a final answer to an exam-style question. Explain the underlying idea briefly,",
    "then diagnose: finish EVERY reply with exactly one specific leading question that finds the learner's gap.",
    "Never reply with an empty prompt or a generic 'what would you like to know?' — always give substance plus one question.",
    levelRule,
    `Reply in ${input.language}. Keep scientific and technical terms in English.`,
    input.isTeacher
      ? "The person asking is the teacher: you may also suggest how to explain or check understanding."
      : "The person asking is a student.",
  ].join("\n");

  const promptParts = [
    `Subject: ${input.subject}`,
    `Unit: ${input.unitTitle}`,
    input.documentTitle ? `Open document: ${input.documentTitle}` : "",
    input.contextNotes ? `Teacher's notes so far:\n${input.contextNotes.slice(0, 6000)}` : "",
    input.concept ? `The learner clicked this concept for explanation: "${input.concept}"` : "",
    "",
    ...input.history.slice(-8).map((turn) => `${turn.role === "user" ? "Learner" : "Tutor"}: ${turn.content}`),
    `Learner: ${input.question}`,
  ].filter(Boolean);

  const { text } = await generateText({
    model: gatewayModel(),
    system,
    prompt: promptParts.join("\n"),
  });
  return text.trim();
}
