import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  dedupeExtractedQuestions,
  renumberQuestions,
  separateQuestionCrops,
} from "./paper-extract.server";

const question = (questionText: string, top: number, bottom: number) => ({
  questionText,
  markScheme: "printed answer",
  marks: 1,
  pages: [1],
  crops: [{ page: 1, top, bottom }],
  answerCrops: null,
});

describe("paper extraction safeguards", () => {
  test("keeps extracted questions in a contiguous logical sequence", () => {
    const result = renumberQuestions([
      question("1 First compiled question", 0.1, 0.2),
      question("1 Second compiled question", 0.3, 0.4),
      question("2 Third compiled question", 0.5, 0.6),
    ]);

    assert.deepEqual(
      result.map((item) => item.questionText),
      ["1 First compiled question", "2 Second compiled question", "3 Third compiled question"],
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

test("keeps printed sub-part lettering while closing main-number gaps", () => {
  const result = renumberQuestions([
    question("4(a) First part", 0.1, 0.2),
    question("4(b)(i) Nested part", 0.2, 0.3),
    question("9 Next question", 0.3, 0.4),
  ]);
  assert.deepEqual(
    result.map((item) => item.questionText),
    ["4(a) First part", "4(b)(i) Nested part", "5 Next question"],
  );
});

test("removes retry duplicates even when their labels and crop edges drift", () => {
  const result = dedupeExtractedQuestions([
    question("3 Explain why the reaction rate decreases as the reactants are used up", 0.1, 0.3),
    question("17 Explain why the reaction rate decreases as reactants are used up", 0.11, 0.31),
  ]);
  assert.equal(result.length, 1);
});

test("matches answer labels by the complete printed number and sub-part", async () => {
  const { answerLabelsMatch } = await import("./paper-extract.server");
  assert.equal(answerLabelsMatch("7(b)(ii)", "7 b ii"), true);
  assert.equal(answerLabelsMatch("7(b)(ii)", "7(b)(i)"), false);
  assert.equal(answerLabelsMatch("7(b)(ii)", "8(b)(ii)"), false);
});
