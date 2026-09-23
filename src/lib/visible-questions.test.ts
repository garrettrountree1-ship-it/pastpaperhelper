import assert from "node:assert/strict";
import test from "node:test";

import { activeQuestionsForStudent, activeTotalMarks } from "./visible-questions";

const questions = [
  { id: "common", marks: 2, tag_label: "" },
  { id: "hl", marks: 5, tag_label: "HL" },
  { id: "removed-for-student", marks: 3, tag_label: "" },
];

test("SL totals include only visible, assigned questions", () => {
  const visible = activeQuestionsForStudent(questions, new Set(["removed-for-student"]), {
    ibdp: true,
    level: "SL",
  });
  assert.deepEqual(
    visible.map((question) => question.id),
    ["common"],
  );
  assert.equal(activeTotalMarks(visible), 2);
});

test("HL totals include common and HL questions but still respect exclusions", () => {
  const visible = activeQuestionsForStudent(questions, new Set(["removed-for-student"]), {
    ibdp: true,
    level: "HL",
  });
  assert.deepEqual(
    visible.map((question) => question.id),
    ["common", "hl"],
  );
  assert.equal(activeTotalMarks(visible), 7);
});

test("HL tags do not hide questions outside IBDP classes", () => {
  assert.equal(
    activeTotalMarks(activeQuestionsForStudent(questions, new Set(), { ibdp: false, level: "SL" })),
    10,
  );
});
