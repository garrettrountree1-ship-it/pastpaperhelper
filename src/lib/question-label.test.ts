import assert from "node:assert/strict";
import test from "node:test";

import {
  formatLabel,
  parseLabelString,
  questionLabel,
  resolveQuestionLabels,
} from "./question-label";

test("keeps compact printed letter and roman sub-parts", () => {
  assert.equal(questionLabel("1(ai) State one reason", 0), "1(ai)");
  assert.equal(questionLabel("1 (a)(ii) Explain why", 0), "1(aii)");
  assert.equal(questionLabel("7biii Calculate", 0), "7(biii)");
});

test("compact display labels remain editable and parseable", () => {
  assert.deepEqual(parseLabelString("12(aiii)"), { main: 12, parts: ["a", "iii"] });
  assert.equal(formatLabel(12, ["a", "iii"]), "12(aiii)");
});

test("fills in missing labels from the question above", () => {
  assert.deepEqual(
    resolveQuestionLabels(["1(a) State one", "(b) Explain", "Calculate the mass", "2 Describe"]),
    ["1(a)", "1(b)", "1(c)", "2"],
  );
});

test("numbers an unlabelled paper in order", () => {
  assert.deepEqual(resolveQuestionLabels(["State one", "Explain"]), ["1", "2"]);
});
