/**
 * Keyboard shortcuts for the lesson canvas and document text boxes so
 * Ctrl/⌘ + B / I / U format text and Ctrl/⌘ + Z / Y undo and redo, exactly as
 * they do in Word.
 */
export type TextShortcut = "bold" | "italic" | "underline" | "undo" | "redo";

export function textShortcutOf(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): TextShortcut | null {
  if (!event.ctrlKey && !event.metaKey) return null;
  const key = event.key.toLowerCase();
  if (key === "b") return "bold";
  if (key === "i") return "italic";
  if (key === "u") return "underline";
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y") return "redo";
  return null;
}
