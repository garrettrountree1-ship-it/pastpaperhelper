import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  extractChoiceAnswer,
  extractFinalNumber,
  markTypedChoice,
  markTypedFinalNumber,
} from "./deterministic-marking.ts";

describe("deterministic answer marking", () => {
  test("multiple-choice checking ignores case and harmless answer wording", () => {
    assert.equal(extractChoiceAnswer("C (1 mark) — correct reason"), "C");
    assert.equal(markTypedChoice("answer: c", "C", 1)?.verdict, "correct");
    assert.equal(markTypedChoice("d", "C", 1)?.verdict, "incorrect");
  });

  test("final-number extraction ignores mark allocations", () => {
    assert.equal(extractFinalNumber("M1 substitution; 3.42 mol (2 marks)"), "3.42");
  });

  test("final-number checking accepts equivalent scientific notation", () => {
    assert.equal(markTypedFinalNumber("0.00342", "3.42 × 10⁻³", 3)?.awardedMarks, 3);
    assert.equal(markTypedFinalNumber("0.0034", "3.42e-3", 3)?.awardedMarks, 0);
  });
});
