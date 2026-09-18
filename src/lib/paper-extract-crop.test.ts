import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  reconcileCropAudit,
  renumberQuestions,
  type ExtractedQuestion,
} from "./paper-extract.server.ts";

function question(questionText: string): ExtractedQuestion {
  return { questionText, markScheme: "", marks: 1, pages: [1], crops: null };
}

describe("paper extraction safeguards", () => {
  test("a disjoint audit cannot replace a located question with whitespace", () => {
    const original = [{ sheet: "paper" as const, page: 2, top: 0.2, bottom: 0.4 }];
    const blankGuess = [{ sheet: "paper" as const, page: 2, top: 0.7, bottom: 0.8 }];
    assert.deepEqual(reconcileCropAudit(original, blankGuess), original);
  });

  test("an overlapping audit may safely tighten crop edges", () => {
    const original = [{ sheet: "paper" as const, page: 2, top: 0.2, bottom: 0.4 }];
    const tighter = [{ sheet: "paper" as const, page: 2, top: 0.22, bottom: 0.38 }];
    assert.deepEqual(reconcileCropAudit(original, tighter), tighter);
  });

  test("compact and standalone subparts stay under their printed main number", () => {
    const result = renumberQuestions([
      question("7(a) First part"),
      question("aii Second roman part"),
      question("aiii Third roman part"),
      question("(b) Next letter"),
      question("8(a) New printed question"),
    ]);
    assert.deepEqual(
      result.map((item) => item.questionText.split(" ")[0]),
      ["7(a)", "7(a)(ii)", "7(a)(iii)", "7(b)", "8(a)"],
    );
  });
});
