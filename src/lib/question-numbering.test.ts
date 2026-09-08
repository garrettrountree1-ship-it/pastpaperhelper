import { describe, expect, it } from "vitest";

import { renumberQuestions, type ExtractedQuestion } from "./paper-extract.server";

function item(questionText: string): ExtractedQuestion {
  return { questionText, markScheme: "answer", marks: 1, pages: [1], crops: null };
}

describe("past-paper question numbering", () => {
  it("keeps standalone letters under the preceding number", () => {
    const result = renumberQuestions([item("1 Main stem"), item("(a) First part"), item("b. Second part"), item("2 Next")]);
    expect(result.map((question) => question.questionText)).toEqual([
      "1 Main stem",
      "1(a) First part",
      "1(b) Second part",
      "2 Next",
    ]);
  });

  it("keeps standalone Roman parts under the active letter", () => {
    const result = renumberQuestions([item("3(a) Stem"), item("(i) First"), item("(ii) Second")]);
    expect(result.map((question) => question.questionText)).toEqual([
      "1(a) Stem",
      "1(a)(i) First",
      "1(a)(ii) Second",
    ]);
  });
});