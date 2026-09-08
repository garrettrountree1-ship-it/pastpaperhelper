import { describe, expect, it } from "vitest";

import { renumberQuestions, type ExtractedQuestion } from "./paper-extract.server";
import { questionBody, questionLabel } from "./question-label";

function questions(labels: string[]): ExtractedQuestion[] {
  return labels.map((label) => ({
    questionText: `${label} Prompt`,
    markScheme: "",
    marks: 1,
    pages: [1],
  }));
}

describe("multipart question numbering", () => {
  it("recognises compact letter and Roman-numeral sequences", () => {
    const result = renumberQuestions(questions(["1 a", "ai", "aii", "b", "bi", "bii", "biii", "c"]));
    expect(result.map((item) => questionLabel(item.questionText, 0))).toEqual([
      "1(a)",
      "1(a)(i)",
      "1(a)(ii)",
      "1(b)",
      "1(b)(i)",
      "1(b)(ii)",
      "1(b)(iii)",
      "1(c)",
    ]);
  });

  it("recognises spaced and parenthesized equivalents", () => {
    const result = renumberQuestions(
      questions(["4(a)", "(i)", "(ii)", "(b)(i)", "b ii", "(b)(iii)", "5. a(i)"]),
    );
    expect(result.map((item) => questionLabel(item.questionText, 0))).toEqual([
      "1(a)",
      "1(a)(i)",
      "1(a)(ii)",
      "1(b)(i)",
      "1(b)(ii)",
      "1(b)(iii)",
      "2(a)(i)",
    ]);
  });

  it("removes compact labels from the displayed question body", () => {
    expect(questionLabel("7biii Explain why", 0)).toBe("7(b)(iii)");
    expect(questionBody("7biii Explain why")).toBe("Explain why");
  });
});