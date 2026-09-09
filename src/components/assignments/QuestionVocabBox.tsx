import { BookOpen } from "lucide-react";

export type VocabPair = { term: string; translation: string };

/**
 * Question Vocabulary Translation — a small box shown directly under the
 * question showing key words from that question with their translation.
 * Replaces the old hover-to-translate behaviour, which was unreliable on
 * phones and tablets.
 */
export function QuestionVocabBox({
  terms,
  language = "Chinese (Simplified)",
  className,
}: {
  terms: VocabPair[];
  language?: string;
  className?: string;
}) {
  const seen = new Set<string>();
  const usable = terms.filter((pair) => {
    const term = pair.term?.trim() ?? "";
    const translation = pair.translation?.trim() ?? "";
    if (term.length < 2 || translation.length === 0) return false;
    const key = term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (usable.length === 0) return null;

  return (
    <details className={`rounded-lg border border-border bg-secondary/40 p-3 ${className ?? ""}`}>
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <BookOpen className="size-3.5" />
        Question vocabulary · {language}
      </summary>
      <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {usable.map((pair) => (
          <li key={pair.term} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-medium">{pair.term.trim()}</span>
            <span className="text-muted-foreground">{pair.translation.trim()}</span>
          </li>
        ))}
      </ul>
    </details>
  );

}
