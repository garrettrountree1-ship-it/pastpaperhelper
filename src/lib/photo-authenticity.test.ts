import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { evaluatePhotoResults, type PhotoImageResult } from "./photo-authenticity.server";

const result = (overrides: Partial<PhotoImageResult> = {}): PhotoImageResult => ({
  index: 0,
  handDrawn: true,
  kind: "hand-drawn graph on squared paper",
  confidence: 0.7,
  reason: "Visible pencil marks on graph paper.",
  ...overrides,
});

describe("photo authenticity decisions", () => {
  test("allows hand-drawn work even when classifier confidence is low", () => {
    assert.equal(evaluatePhotoResults([result({ confidence: 0.2 })], 1).ok, true);
  });

  test("allows an uncertain negative to avoid false academic-integrity strikes", () => {
    assert.equal(
      evaluatePhotoResults([result({ handDrawn: false, confidence: 0.84 })], 1).ok,
      true,
    );
  });

  test("rejects a confidently identified digital upload", () => {
    const check = evaluatePhotoResults(
      [result({ handDrawn: false, confidence: 0.95, kind: "a screenshot of a graphing app" })],
      1,
    );

    assert.equal(check.ok, false);
    assert.equal(check.confidence, 0.95);
    assert.match(check.reason, /screenshot of a graphing app/);
    assert.match(check.reason, /re-take the photo/);
  });

  test("fails open when the classifier returns missing or duplicate indexes", () => {
    assert.equal(evaluatePhotoResults([result()], 2).ok, true);
    assert.equal(evaluatePhotoResults([result(), result()], 2).ok, true);
  });
});
