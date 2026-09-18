import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renumberQuestions, separateQuestionCrops } from "./paper-extract.server";

const question = (questionText: string, top: number, bottom: number) => ({
  questionText,
  markScheme: "printed answer",
  marks: 1,
  pages: [1],
  crops: [{ page: 1, top, bottom }],
  answerCrops: null,
});

describe("paper extraction safeguards", () => {
  test("keeps the number visible in each cut instead of inventing a sequence", () => {
    const result = renumberQuestions([
      question("1 First compiled question", 0.1, 0.2),
      question("1 Second compiled question", 0.3, 0.4),
      question("2 Third compiled question", 0.5, 0.6),
    ]);

    assert.deepEqual(
      result.map((item) => item.questionText),
      ["1 First compiled question", "1 Second compiled question", "2 Third compiled question"],
    );
  });

  test("closely spaced questions retain safe narrow crops", () => {
    const result = separateQuestionCrops([
      question("1 First", 0.1, 0.108),
      question("2 Second", 0.108, 0.116),
    ]);

    assert.equal(result[0]?.crops?.length, 1);
    assert.equal(result[1]?.crops?.length, 1);
  });
});
