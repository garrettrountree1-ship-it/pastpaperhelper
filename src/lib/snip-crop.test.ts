import { describe, expect, it } from "vitest";

import { pageWithoutCrop, parseCropFragment, withCrop } from "./snip-crop";

describe("question crop fragments", () => {
  it("preserves a signed page URL while replacing its crop", () => {
    const url = "https://example.test/page.jpg?token=abc#crop=0.1,0.5";
    expect(withCrop(url, { top: 0.2, bottom: 0.4 }, true)).toBe(
      "https://example.test/page.jpg?token=abc#crop=0.2000,0.4000;manual",
    );
  });

  it("reads manual crops and recovers the full page", () => {
    const url = "paper/page-2.jpg#crop=0.1234,0.5678;manual";
    expect(parseCropFragment(url)).toEqual({ top: 0.1234, bottom: 0.5678 });
    expect(pageWithoutCrop(url)).toBe("paper/page-2.jpg");
  });
});