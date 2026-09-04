import { cleanTutorText } from "@/lib/math-text";

export { cleanMathText, cleanTutorText } from "@/lib/math-text";

type Piece = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

function piecesOf(line: string): Piece[] {
  const pieces: Piece[] = [];
  const pattern = /\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|(?<!\*)\*(?!\*)([^*\n]+)\*|`([^`\n]+)`/g;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    if (match.index > index) pieces.push({ text: line.slice(index, match.index) });
    if (match[1] ?? match[2]) pieces.push({ text: (match[1] ?? match[2])!, bold: true });
    else if (match[3]) pieces.push({ text: match[3], italic: true });
    else if (match[4]) pieces.push({ text: match[4], code: true });
    index = match.index + match[0].length;
  }
  if (index < line.length) pieces.push({ text: line.slice(index) });
  return pieces.length > 0 ? pieces : [{ text: line }];
}

/**
 * Renders a tutor reply as readable text: real bold / italic, proper science
 * symbols, and equations written the way a student would write them.
 */
export function TutorText({ text, className }: { text: string; className?: string }) {
  const lines = cleanTutorText(text).split("\n");
  return (
    <div className={className}>
      {lines.map((line, lineIndex) => (
        <p key={lineIndex} className={line.trim() === "" ? "h-2" : undefined}>
          {piecesOf(line).map((piece, pieceIndex) => {
            if (piece.bold)
              return (
                <strong key={pieceIndex} className="font-semibold">
                  {piece.text}
                </strong>
              );
            if (piece.italic) return <em key={pieceIndex}>{piece.text}</em>;
            if (piece.code)
              return (
                <code key={pieceIndex} className="rounded bg-muted px-1 py-0.5 text-[0.95em]">
                  {piece.text}
                </code>
              );
            return <span key={pieceIndex}>{piece.text}</span>;
          })}
        </p>
      ))}
    </div>
  );
}
