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
 * Applies bold / italic / underline inside a focused contenteditable element.
 * With words highlighted it restyles just those words; with nothing highlighted
 * it toggles the style for whatever the user types next, exactly like Word.
 */
export function formatSelection(command: "bold" | "italic" | "underline" | "undo" | "redo") {
  try {
    if (command === "undo" || command === "redo") {
      document.execCommand(command, false);
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    // Keep formatting inside the box the user is actually editing.
    const node =
      range.commonAncestorContainer.nodeType === 1
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;
    if (!node?.closest("[contenteditable='true']")) return;

    // Wrap words in tags rather than styling the whole block. When the caret is
    // collapsed the browser keeps the toggle armed for the next characters.
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false);
  } catch {
    /* older browsers simply skip the command */
  }
}

/** True when the caret / selection currently has this style switched on. */
export function isFormatActive(command: "bold" | "italic" | "underline"): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

