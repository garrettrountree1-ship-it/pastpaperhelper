import { type ReactNode } from "react";

export type GlossaryTerm = { term: string; translation: string };

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Renders question text and, when the teacher enabled keyword translation,
 * underlines key words with a Chinese gloss shown on hover / long-press.
 * Only single words or short phrases are ever glossed — never whole sentences.
 */
export function GlossaryText({
  text,
  terms = [],
  className,
}: {
  text: string;
  terms?: GlossaryTerm[];
  className?: string;
}) {
  const usable = terms.filter((t) => t.term.trim().length > 1 && t.translation.trim().length > 0);

  if (usable.length === 0) {
    return <p className={className}>{text}</p>;
  }

  const pattern = new RegExp(
    `(${usable
      .map((t) => escapeRegExp(t.term.trim()))
      .sort((a, b) => b.length - a.length)
      .join("|")})`,
    "gi",
  );

  const lookup = new Map(usable.map((t) => [t.term.trim().toLowerCase(), t.translation]));
  const nodes: ReactNode[] = [];

  text.split(pattern).forEach((chunk, index) => {
    const gloss = lookup.get(chunk.trim().toLowerCase());
    if (gloss) {
      nodes.push(
        <span
          key={`${index}-${chunk}`}
          title={gloss}
          aria-label={`${chunk} — ${gloss}`}
          tabIndex={0}
          className="group relative cursor-help underline decoration-primary/60 decoration-dotted decoration-2 underline-offset-4"
        >
          {chunk}
          <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background group-hover:block group-focus:block">
            {gloss}
          </span>
        </span>,
      );
    } else if (chunk) {
      nodes.push(<span key={`${index}-plain`}>{chunk}</span>);
    }
  });

  return <p className={className}>{nodes}</p>;
}
