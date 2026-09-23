import { generateText } from "ai";

import { cleanMathText } from "./math-text";
import { fastModel } from "./ai-gateway.server";

/**
 * Builds an AI study summary from everything on the lesson page: the text the
 * teacher typed, the images pasted onto the canvas, the pen strokes drawn on
 * the canvas, and anything drawn or typed on the attached document.
 */
export async function summariseTeacherNotes(input: {
  unitTitle: string;
  sectionTitle: string;
  subject: string;
  notesText: string;
  /** Images pasted on the canvas (signed URLs) plus rasterised ink (data URLs). */
  canvasImageUrls?: string[];
  canvasInk?: string | null;
  /** Drawing marked on the attached document, one image per annotated page. */
  docInk?: string[];
  /** Text typed into text boxes placed on the document. */
  docTexts?: string[];
  documentTitle?: string | null;
}): Promise<string> {
  const notes = input.notesText.trim();
  const canvasImages = input.canvasImageUrls ?? [];
  const docInk = input.docInk ?? [];
  const docTexts = (input.docTexts ?? []).filter((line) => line.trim());
  const hasVisuals = canvasImages.length > 0 || Boolean(input.canvasInk) || docInk.length > 0;
  if (notes.length < 20 && !hasVisuals && docTexts.length === 0) return "";

  const system = [
    "You organise a teacher's live lesson material into a clean study summary for students.",
    "The lesson has several parts, all of equal importance: typed notes, pictures pasted on the lesson canvas, handwriting and diagrams drawn in pen on the canvas, and pen marks or text boxes the teacher added on top of the lesson document.",
    "Read every attached image carefully and include what is written, drawn, labelled, circled or highlighted there — handwritten working, sketches, diagrams, annotations and emphasis all count as taught content.",
    "Use ONLY content that appears in the notes, the images or the document annotations. Never add facts, examples or vocabulary that are not there.",
    "If something in an image is genuinely illegible, ignore it silently rather than guessing.",
    "If a section has nothing to fill it, omit that section entirely.",
    "Write in clear British English, plain text with simple markdown headings and bullets.",
    "Write equations and symbols as plain readable text with real Unicode characters (°C, °F, ×, ÷, ≠, ≤, ≥, →, π, Δ, m², H₂O, x = (y - b)/m). Never use LaTeX or maths delimiters ($, $$, \\frac, \\(, \\[) and never use markdown tables or code fences.",
    "Structure (only the parts that apply):",
    "## Key concepts",
    "## Vocabulary",
    "## Worked examples",
    "## Diagrams and drawings",
    "## Highlighted on the document",
    "## Things to remember",
    "Keep it tight: no filler, no introductions, no closing remarks.",
  ].join("\n");

  const prompt = [
    `Subject: ${input.subject}`,
    `Unit: ${input.unitTitle}`,
    `Section: ${input.sectionTitle}`,
    input.documentTitle ? `Attached document: ${input.documentTitle}` : "",
    "",
    notes ? `Teacher's typed notes:\n${notes}` : "The teacher typed no notes on the canvas.",
    docTexts.length > 0
      ? `Text boxes the teacher added on the document:\n${docTexts.join("\n")}`
      : "",
    canvasImages.length > 0
      ? `${canvasImages.length} picture(s) placed on the lesson canvas are attached.`
      : "",
    input.canvasInk
      ? "One attached image shows everything the teacher drew or handwrote in pen on the lesson canvas (white background, pen strokes only)."
      : "",
    docInk.length > 0
      ? `${docInk.length} attached image(s) show the pen marks the teacher drew on the lesson document (white background, marks only — these highlight what mattered on those pages).`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const asImage = (url: string) =>
    ({ type: "image" as const, image: url.startsWith("data:") ? url : new URL(url) });

  const content = [
    { type: "text" as const, text: prompt },
    ...canvasImages.map(asImage),
    ...(input.canvasInk ? [asImage(input.canvasInk)] : []),
    ...docInk.map(asImage),
  ];

  const { text } = await generateText({
    model: fastModel(),
    system,
    messages: [{ role: "user", content }],
  });
  return cleanMathText(text).trim();
}


export type TutorTurn = { role: "user" | "assistant"; content: string };

/**
 * Always-on lesson tutor. During lessons it answers directly and accurately.
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
      ? "Very simple English, short sentences, define any hard term (max 110 words)."
      : input.level === "advanced"
        ? "Technical, exam-level language and full scientific detail (max 180 words)."
        : "Clear exam-style explanation with correct terminology (max 150 words).";

  const system = [
    "You are the in-class AI tutor for a past-paper study app, used live during lessons.",
    "Answer the learner's question directly, precisely and scientifically correctly.",
    "Give the actual answer first (state the fact, definition, value, equation or worked steps),",
    "then a brief explanation of the science or reasoning behind it.",
    "Show calculations step by step with units, and name the correct scientific terms.",
    "Do NOT reply with only leading questions and do NOT withhold the answer.",
    "You may end with at most one short check-for-understanding question, but only after a complete answer.",
    "Ground answers in the teacher's notes and lesson topic below; if the notes conflict with established science, say so plainly.",
    "If you are unsure, say what is certain and what is not — never invent facts.",
    "Write equations and symbols as plain readable text with real Unicode characters (°C, °F, ×, ÷, ≠, ≤, ≥, →, π, Δ, m², H₂O, x = (y - b)/m). Never use LaTeX or maths delimiters ($, $$, \\frac, \\(, \\[) and never use markdown tables or code fences.",
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
    model: fastModel(),
    system,
    prompt: promptParts.join("\n"),
  });
  return text.trim();
}
