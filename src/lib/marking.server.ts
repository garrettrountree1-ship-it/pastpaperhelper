import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";

import { gatewayModel } from "./ai-gateway.server";

export type MarkPoint = { point: string; marks: number; awarded: boolean };

export type MarkResult = {
  verdict: "correct" | "partial" | "incorrect";
  awardedMarks: number;
  feedback: string;
  leadingQuestion: string;
  markPoints: MarkPoint[];
};

const markSchema = z.object({
  verdict: z.enum(["correct", "partial", "incorrect"]),
  awardedMarks: z.number(),
  feedback: z.string(),
  leadingQuestion: z.string(),
  markPoints: z
    .array(
      z.object({
        point: z.string(),
        marks: z.number(),
        awarded: z.boolean(),
      }),
    )
    .default([]),
});

type MarkInput = {
  curriculum: string;
  subject: string;
  question: string;
  markScheme: string;
  marks: number;
  answer: string;
  imageUrls?: string[];
  /** Original past-paper page images holding the question's figures/equations. */
  questionImageUrls?: string[];
};

export async function markStudentAnswer(input: MarkInput): Promise<MarkResult> {
  const images = input.imageUrls ?? [];
  const questionImages = input.questionImageUrls ?? [];
  const prompt = [
    `Curriculum: ${input.curriculum}`,
    `Subject: ${input.subject || "General"}`,
    `Marks available: ${input.marks}`,
    `Question:\n${input.question}`,
    `Official mark scheme:\n${input.markScheme}`,
    `Student typed answer:\n${input.answer || "(none typed)"}`,
    questionImages.length > 0
      ? "The first attached image(s) are the original past-paper page(s) for this question, including any figure, diagram, graph or equation the student is working from."
      : "",
    images.length > 0
      ? `The student also attached ${images.length} photo(s) of handwritten working or a diagram. Read them carefully — that working is part of the answer.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = [
    "You are an experienced examiner marking IGCSE, A-Level and IB work strictly against the official mark scheme.",
    "Answers may include photos of handwritten maths working, graphs or diagrams; read the images and credit correct working shown there.",
    "Split the mark scheme into its individual marking points exactly as written (each M1/A1/B1 or bullet worth its stated marks) and return them in markPoints with marks for that point and awarded true/false. The sum of the marks of awarded points MUST equal awardedMarks.",
    "Award marks only for points that genuinely match the mark scheme. Never award more than the marks available and never award negative marks.",
    "verdict is 'correct' only when full marks are earned, 'partial' when some marks are earned, 'incorrect' when none are.",
    "feedback: at most 3 short sentences, addressed to the student, saying what was credited and what is missing. Never reveal the full mark scheme answer.",
    "leadingQuestion: one short Socratic question that probes the most likely misunderstanding behind the mistake, to help the student find the gap themselves. If the answer is fully correct, leave leadingQuestion as an empty string.",
  ].join(" ");

  try {
    const { output } = await generateText({
      model: gatewayModel(),
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "text" as const, text: prompt },
            ...questionImages.map((url) => ({ type: "image" as const, image: new URL(url) })),
            ...images.map((url) => ({ type: "image" as const, image: new URL(url) })),
          ],
        },
      ],
      output: Output.object({ schema: markSchema }),
    });
    return clamp(output, input.marks);
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error) && error.text) {
      try {
        const parsed = markSchema.parse(JSON.parse(extractJson(error.text)));
        return clamp(parsed, input.marks);
      } catch {
        /* fall through */
      }
    }
    throw error;
  }
}

function clamp(result: z.infer<typeof markSchema>, maxMarks: number): MarkResult {
  const awarded = Math.max(0, Math.min(maxMarks, Math.round(result.awardedMarks * 2) / 2));
  return {
    verdict: result.verdict,
    awardedMarks: awarded,
    feedback: result.feedback.trim(),
    leadingQuestion: result.leadingQuestion.trim(),
    markPoints: (result.markPoints ?? []).map((p) => ({
      point: p.point.trim(),
      marks: Math.max(0, Math.min(maxMarks, p.marks)),
      awarded: Boolean(p.awarded),
    })),
  };
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

type TutorTurn = { role: "tutor" | "student"; content: string };

type TutorInput = {
  curriculum: string;
  subject: string;
  question: string;
  markScheme: string;
  marks: number;
  studentAnswer: string;
  history: TutorTurn[];
  latestMessage: string;
};

export async function tutorStep(input: TutorInput): Promise<string> {
  const system = [
    "You are a patient Socratic tutor for IGCSE, A-Level and IB students. You know the official mark scheme but you must NEVER state the final answer or quote the mark scheme.",
    "Your job: diagnose the student's knowledge gap with one short leading question at a time.",
    "Once you can see where the misunderstanding is, break the problem into the smallest possible next step and ask the student to do only that step.",
    "Reply with at most 3 short sentences and exactly one question. Confirm what the student got right before nudging.",
    "When the student has worked all the way to a correct understanding, congratulate them briefly and tell them to re-submit their improved answer.",
  ].join(" ");

  const transcript = input.history
    .map((turn) => `${turn.role === "tutor" ? "Tutor" : "Student"}: ${turn.content}`)
    .join("\n");

  const prompt = [
    `Curriculum: ${input.curriculum}`,
    `Subject: ${input.subject || "General"} (${input.marks} marks)`,
    `Question:\n${input.question}`,
    `Official mark scheme (never reveal):\n${input.markScheme}`,
    `Student's submitted answer:\n${input.studentAnswer}`,
    transcript ? `Conversation so far:\n${transcript}` : "No conversation yet.",
    `Student's latest message:\n${input.latestMessage}`,
  ].join("\n\n");

  const { text } = await generateText({ model: gatewayModel(), system, prompt });
  return text.trim();
}
