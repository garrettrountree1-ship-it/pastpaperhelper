import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  extractChoiceAnswer,
  extractFinalNumber,
  isFinalValueOnlyAnswer,
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

  test("final-number checking accepts inclusive teacher-entered ranges", () => {
    assert.equal(markTypedFinalNumber("3.4", "3.2 to 3.5", 2)?.awardedMarks, 2);
    assert.equal(markTypedFinalNumber("3.5", "[3.2, 3.5]", 2)?.awardedMarks, 2);
    assert.equal(markTypedFinalNumber("3.6", "3.2 to 3.5", 2)?.awardedMarks, 0);
  });

  test("distinguishes a final value from calculation working", () => {
    assert.equal(isFinalValueOnlyAnswer("3.42 mol dm⁻³"), true);
    assert.equal(isFinalValueOnlyAnswer("answer = 3.42"), true);
    assert.equal(isFinalValueOnlyAnswer("7 - 4 = 3"), false);
    assert.equal(isFinalValueOnlyAnswer("2 × 5 = 10"), false);
    assert.equal(isFinalValueOnlyAnswer("2\n5\n10"), false);
    assert.equal(isFinalValueOnlyAnswer("I substituted into the formula and got 3.42"), false);
  });
});
