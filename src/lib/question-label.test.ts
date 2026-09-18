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

test("repairs legacy running numbers placed before dotted sub-parts", () => {
  assert.deepEqual(
    resolveQuestionLabels([
      "4 A standalone question",
      "5 A shared stem\n\n(a.ii) Calculate the amount",
      "6 (b.i) (b.i) Sketch the curve",
      "7 (b.ii) Explain the change",
      "8 A new standalone question",
    ]),
    ["4", "5(aii)", "5(bi)", "5(bii)", "6"],
  );
});

test("parses dotted sub-parts without losing letter or roman numbering", () => {
  assert.equal(questionLabel("6 (b.ii) Explain", 5), "6(bii)");
  assert.deepEqual(parseLabelString("6(b.ii)"), { main: 6, parts: ["b", "ii"] });
});
