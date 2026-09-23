import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./PhotoPageMode.tsx", import.meta.url), "utf8");

test("photo mode keeps the resolved implementation free of merge artifacts", () => {
  assert.equal(/^(?:<<<<<<<|=======|>>>>>>>)/m.test(source), false);
  assert.equal(source.match(/import \{ useMutation, useQuery, useQueryClient \}/g)?.length, 1);
  assert.equal(source.match(/export function PhotoPageMode\s*\(/g)?.length, 1);
  assert.equal(source.match(/async function cropQuestion\s*\(/g)?.length, 1);
  assert.match(
    source,
    /async function cropQuestion\(file: File, band: \{ top: number; bottom: number \}, name: string\)/,
  );
});

test("photo mode uses automatic page trimming with the compact cut editor", () => {
  assert.match(source, /async function trimPhotoToPage\s*\(/);
  assert.match(source, /function QuestionCutEditor\s*\(/);
  assert.doesNotMatch(source, /const \[trim, setTrim\]/);
  assert.doesNotMatch(source, /\btrim,\s*`preview-/);
  assert.doesNotMatch(source, /\[photo, group, questionBands, trim\]/);
  assert.doesNotMatch(source, /if \(groups\.length === 0\)\s*\{\s*return \(/);
});

test("photo mode retains vocabulary and two-way tutor controls", () => {
  assert.match(source, /function PhotoQuestionVocabulary\s*\(/);
  assert.match(source, /function PhotoTutorConversation\s*\(/);
  assert.match(source, /<PhotoQuestionVocabulary/);
  assert.match(source, /<PhotoTutorConversation/);
});

test("photo mode renders marking feedback once through TutorText", () => {
  assert.equal(source.match(/result\?\.feedback \? <TutorText/g)?.length, 1);
  assert.doesNotMatch(source, /<p className="text-sm">\{result\.feedback\}<\/p>/);
});
