import assert from "node:assert/strict";
import test from "node:test";

import { formatLabel, parseLabelString, questionLabel, questionLabels } from "./question-label";

test("keeps compact printed letter and roman sub-parts", () => {
  assert.equal(questionLabel("1(ai) State one reason", 0), "1(ai)");
  assert.equal(questionLabel("1 (a)(ii) Explain why", 0), "1(aii)");
  assert.equal(questionLabel("7biii Calculate", 0), "7(biii)");
});

test("carries a printed main number across standalone sub-part cuts", () => {
  assert.deepEqual(
    questionLabels(["1 Describe", "(ai) State one reason", "(aii) Explain", "2 Calculate"]),
    ["1", "1(ai)", "1(aii)", "2"],
  );
});

test("compact display labels remain editable and parseable", () => {
  assert.deepEqual(parseLabelString("12(aiii)"), { main: 12, parts: ["a", "iii"] });
  assert.equal(formatLabel(12, ["a", "iii"]), "12(aiii)");
});
