/**
 * Minimal rich-text helpers for the lesson canvas and slide/document text
 * boxes. Text boxes store a small sanitised HTML string so Ctrl/⌘ + B / I / U
 * format only the words the user highlighted, exactly like Word.
 */

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "DIV", "P", "SPAN"]);

/** Escapes plain text so it can be used as HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

/** Strips everything except simple inline formatting tags and their text. */
export function sanitizeRichText(html: string): string {
  if (typeof document === "undefined") return "";
  const host = document.createElement("div");
  host.innerHTML = html;

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      walk(child);
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        // Keep only inline styling that our own formatting produces.
        if (attr.name !== "style") child.removeAttribute(attr.name);
      }
    }
  };
  walk(host);
  return host.innerHTML;
}

/** Plain-text version of a rich-text value, for summaries and search. */
export function richTextToPlain(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, "");
  const host = document.createElement("div");
  host.innerHTML = html.replace(/<br\s*\/?>(?!$)/gi, "\n").replace(/<\/(div|p)>/gi, "\n");
  return (host.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Applies bold / italic / underline to the current selection inside a focused
 * contenteditable element.
 */
export function formatSelection(command: "bold" | "italic" | "underline" | "undo" | "redo") {
  try {
    document.execCommand(command, false);
  } catch {
    /* older browsers simply skip the command */
  }
}
