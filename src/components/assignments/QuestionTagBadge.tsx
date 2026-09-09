/**
 * Small mark shown beside a question number, e.g. the IBDP blue "HL" square,
 * a teacher's own letters, or an uploaded logo.
 */
export function QuestionTagBadge({
  label,
  image,
  className = "",
}: {
  label?: string | null | undefined;
  image?: string | null | undefined;
  className?: string | undefined;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt={label ? `${label} question` : "Question label"}
        className={`inline-block h-5 w-auto max-w-16 rounded object-contain align-middle ${className}`}
      />
    );
  }
  if (!label?.trim()) return null;
  return (
    <span
      className={`inline-flex items-center rounded bg-[hsl(215_75%_28%)] px-1.5 py-0.5 font-display text-[0.7rem] font-bold uppercase leading-none tracking-wide text-white ${className}`}
    >
      {label.trim()}
    </span>
  );
}
