import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./PhotoPageMode.tsx", import.meta.url), "utf8");

test("photo mode keeps the resolved implementation free of merge artifacts", () => {
  assert.equal(/^(?:<<<<<<<|=======|>>>>>>>)/m.test(source), false);
  assert.equal(source.match(/async function cropQuestion\s*\(/g)?.length, 1);
});

test("photo mode uses automatic page trimming with the compact cut editor", () => {
  assert.match(source, /async function trimPhotoToPage\s*\(/);
  assert.match(source, /function QuestionCutEditor\s*\(/);
  assert.doesNotMatch(source, /const \[trim, setTrim\]/);
});

test("photo mode retains vocabulary and two-way tutor controls", () => {
  assert.match(source, /function PhotoQuestionVocabulary\s*\(/);
  assert.match(source, /function PhotoTutorConversation\s*\(/);
  assert.match(source, /<PhotoQuestionVocabulary/);
  assert.match(source, /<PhotoTutorConversation/);
});
