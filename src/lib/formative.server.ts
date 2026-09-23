import { generateText } from "ai";

import { fastModel, gatewayModel } from "./ai-gateway.server";
import { normalisePartLabels, questionParts } from "./question-parts";

export type FormativeVerdict = "correct" | "close" | "incorrect";

/**
 * Marks a quick in-lesson class question. Encouraging by design: a wrong answer
 * gets warm, specific coaching (never a bare "not yet") and never the answer.
 */
export async function markFormativeAnswer(input: {
  question: string;
  expectedAnswer?: string | null;
  /** Picture of the question the teacher pasted in, if any. */
  questionImage?: string | null;
  answer: string;
  attempt: number;
}): Promise<{ verdict: FormativeVerdict; feedback: string }> {
  const system = [
    "You mark a quick formative check during a live lesson.",
    "Be generous: accept correct science expressed in the student's own words, with spelling slips or missing units, as correct.",
    input.questionImage
      ? "An image of the question is attached — read it and mark against what it shows."
      : "",
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
    input.questionImage
      ? "An image of the question is attached — read it and mark against what it shows."
      : "",
    input.expectedAnswer?.trim() ? `Expected answer: ${input.expectedAnswer.trim()}` : "",
    `Student answer (attempt ${input.attempt}): ${input.answer}`,
  ]
    .filter(Boolean)
    .join("\n");

  const content = [
    { type: "text" as const, text: prompt },
    ...(input.questionImage
      ? [
          {
            type: "image" as const,
            image: input.questionImage.startsWith("data:")
              ? input.questionImage
              : new URL(input.questionImage),
          },
        ]
      : []),
  ];

  const { text } = await generateText({
    model: gatewayModel(),
    system,
    messages: [{ role: "user", content }],
  });
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

/**
 * Works out the model answer for a formative check so the teacher can release
 * it to the class, in plain readable words a student can follow.
 */
export async function solveFormativeQuestion(input: {
  question: string;
  questionImage?: string | null;
}): Promise<string> {
  const content = [
    {
      type: "text" as const,
      text: [
        input.question ? `Question: ${input.question}` : "",
        input.questionImage ? "An image of the question is attached — read it." : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    ...(input.questionImage
      ? [
          {
            type: "image" as const,
            image: input.questionImage.startsWith("data:")
              ? input.questionImage
              : new URL(input.questionImage),
          },
        ]
      : []),
  ];

  const { text } = await generateText({
    model: fastModel(),
    system: [
      "You give the model answer to a quick class question, for the teacher to show the class.",
      "Answer directly and briefly: the answer first, then at most two short lines of reasoning.",
      "Use plain readable text with real characters (°C, ×, ≤, →, H₂O). Never use LaTeX or maths delimiters.",
      "Under 70 words.",
    ].join("\n"),
    messages: [{ role: "user", content }],
  });
  return text.trim() || "The answer could not be worked out — please type it for the class.";
}

/**
 * Works out whether a class question has separate parts — (a) (b), i) ii),
 * a(i) a(ii) — reading the pasted picture too. Returns [] for one-part
 * questions. Falls back to the text-only reader if the AI reply is unusable.
 */
export async function detectQuestionParts(input: {
  question: string;
  questionImage?: string | null;
}): Promise<string[]> {
  const fallback = questionParts(input.question ?? "");
  try {
    const content = [
      {
        type: "text" as const,
        text: [
          input.question ? `Question: ${input.question}` : "",
          input.questionImage ? "A picture of the question is attached — read it." : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      ...(input.questionImage
        ? [
            {
              type: "image" as const,
              image: input.questionImage.startsWith("data:")
                ? input.questionImage
                : new URL(input.questionImage),
            },
          ]
        : []),
    ];
    const { text } = await generateText({
      model: fastModel(),
      system: [
        "You list the separate answerable parts of one exam question.",
        "Look for labels such as a b c d, (a) (b), i ii iii, a(i) a(ii), b.i, or 1. 2.",
        "Use the paper's own labels, lowercase. Compound labels are written as two words: \"a i\".",
        "If the question has only one answer, return an empty list.",
        'Reply as strict JSON only: {"parts":["a","b"]}',
      ].join("\n"),
      messages: [{ role: "user", content }],
    });
    const raw = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(raw) as { parts?: unknown };
    const labels = normalisePartLabels(parsed.parts);
    return labels.length >= 2 ? labels : fallback;
  } catch {
    return fallback;
  }
}

/** Marks one part of a multi-part question on its own. */
export async function markFormativePart(input: {
  question: string;
  questionImage?: string | null;
  expectedAnswer?: string | null;
  partLabel: string;
  answer: string;
  attempt: number;
}) {
  return markFormativeAnswer({
    question: [
      input.question,
      `Mark ONLY part (${input.partLabel}) of this question. Ignore all other parts.`,
    ]
      .filter(Boolean)
      .join("\n"),
    expectedAnswer: input.expectedAnswer ?? null,
    questionImage: input.questionImage ?? null,
    answer: input.answer,
    attempt: input.attempt,
  });
}
