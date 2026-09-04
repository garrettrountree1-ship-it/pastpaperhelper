/**
 * Originality checks that complement the AI-text classifier: catches answers
 * copied from a classmate, re-used from another attempt, or lifted verbatim
 * from a source the student pasted/typed in more than once.
 */

export type OriginalityHit = { reason: string; confidence: number };

function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shingles(text: string, size = 4): Set<string> {
  const words = normalise(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  if (words.length <= size) {
    if (words.length) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + size <= words.length; i += 1) {
    out.add(words.slice(i, i + size).join(" "));
  }
  return out;
}

/** Jaccard overlap of word 4-grams: 1 = identical wording, 0 = nothing shared. */
export function similarity(a: string, b: string): number {
  const left = shingles(a);
  const right = shingles(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

type Db = {
  from: (table: string) => any;
};

/**
 * Compares the answer with every other student's answers (and attempt history)
 * for the same question. Near-identical wording means the text was copied from
 * a shared source rather than written by this student.
 */
export async function findCopiedFromPeers(
  db: Db,
  questionId: string,
  submissionId: string,
  answerText: string,
): Promise<OriginalityHit | null> {
  const words = normalise(answerText).split(" ").filter(Boolean).length;
  if (words < 6) return null;

  const { data: rows } = await db
    .from("answers")
    .select("submission_id, answer_text, attempt_history")
    .eq("question_id", questionId)
    .neq("submission_id", submissionId)
    .limit(200);

  const candidates: string[] = [];
  for (const row of (rows ?? []) as Array<{
    answer_text: string | null;
    attempt_history: unknown;
  }>) {
    if (row.answer_text) candidates.push(row.answer_text);
    if (Array.isArray(row.attempt_history)) {
      for (const attempt of row.attempt_history as Array<Record<string, unknown>>) {
        const text = attempt?.["answer_text"];
        if (typeof text === "string" && text.trim()) candidates.push(text);
      }
    }
  }

  let best = 0;
  for (const candidate of candidates) {
    const score = similarity(answerText, candidate);
    if (score > best) best = score;
  }

  if (best >= 0.42) {
    return {
      reason:
        best >= 0.85
          ? "The answer is word-for-word identical to another student's answer, so it is copied from a shared source."
          : "The answer closely matches another student's wording, so it is copied from a shared source rather than written independently.",
      confidence: Math.min(0.99, best),
    };
  }
  return null;
}
