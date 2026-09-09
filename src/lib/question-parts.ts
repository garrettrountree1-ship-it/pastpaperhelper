/**
 * Finds the labels of a multi-part question so each part gets its own answer
 * box: (a) (b) (c), a) b), i) ii) iii), 1. 2. 3., and compact mixes such as
 * a, ai, aii, b, bi. Returns [] for a single-part question.
 */
export function questionParts(question: string): string[] {
  const text = question ?? "";
  const patterns = [
    // a(i) / a.ii / (a)(ii) style compound labels
    /(?:^|[\s(])\(?([a-h])\)?[\s.]*\(?((?:i|ii|iii|iv|v|vi|vii|viii)\)?)[).]/gi,
    /(?:^|[\s(])\(?([a-h])[).]/g,
    /(?:^|[\s(])\(?((?:i|ii|iii|iv|v|vi|vii|viii))[).]/gi,
    /(?:^|[\s(])\(?([1-9])[).]/g,
    // Bare letters at the start of a line: "a Name two metals"
    /^\s*([a-h])\s+(?=[A-Z(])/gm,
  ];
  for (const pattern of patterns) {
    const found: string[] = [];
    for (const match of text.matchAll(pattern)) {
      const label = [match[1], match[2]]
        .filter(Boolean)
        .map((piece) => piece!.replace(/[).]/g, "").toLowerCase())
        .join(" ")
        .trim();
      if (label && !found.includes(label)) found.push(label);
    }
    if (found.length >= 2) return found.slice(0, 10);
  }
  return [];
}

/** Tidies AI-suggested part labels into short, safe display labels. */
export function normalisePartLabels(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  const out: string[] = [];
  for (const raw of labels) {
    if (typeof raw !== "string") continue;
    const label = raw
      .toLowerCase()
      .replace(/[()[\].]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!label || label.length > 8) continue;
    if (!/^[a-z0-9]+(?: [a-z0-9]+)?$/.test(label)) continue;
    if (!out.includes(label)) out.push(label);
  }
  return out.length >= 2 ? out.slice(0, 10) : [];
}
