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
 * contenteditable element. Formatting is deliberately ignored when nothing is
 * highlighted, so a shortcut can never restyle the whole text box by accident.
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
    if (range.collapsed || selection.toString().length === 0) return;

    // Keep formatting inside the box the user is actually editing.
    const host = (
      range.commonAncestorContainer.nodeType === 1
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement
    )?.closest("[contenteditable='true']");
    if (!host || !host.contains(document.activeElement) && document.activeElement !== host) {
      // Selection is not in a focused editable box — do nothing.
      if (document.activeElement !== host) return;
    }

    // Wrap the highlighted words in tags rather than styling the whole block.
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false);
  } catch {
    /* older browsers simply skip the command */
  }
}

