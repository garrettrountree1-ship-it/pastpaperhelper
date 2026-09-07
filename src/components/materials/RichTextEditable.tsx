import { useEffect, useRef } from "react";

import { formatSelection, richTextToPlain, sanitizeRichText } from "@/lib/rich-text";
import { textShortcutOf } from "@/lib/text-shortcuts";

/**
 * A small rich-text box used by the lesson canvas and the slide / document
 * markup layers.  * markup layers. Ctrl/⌘+B/I/U format highlighted words or arm the style for
 * the text typed next, and
 * copy / paste behave like a normal editor (paste arrives as plain text so
 * nothing unexpected is injected).
 */
export function RichTextEditable({
  html,
  onChange,
  onFocus,
  onBlur,
  style,
  className,
  placeholder,
  autoFocus,
  onUndo,
  onRedo,
}: {
  html: string;
  onChange: (next: { html: string; text: string }) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: React.CSSProperties;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastEmitted = useRef<string>("");

  // Only write into the DOM when the value changed elsewhere, so the caret
  // never jumps while typing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (html === lastEmitted.current) return;
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [html]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const next = sanitizeRichText(el.innerHTML);
    lastEmitted.current = next;
    onChange({ html: next, text: richTextToPlain(next) });
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder}
      spellCheck
      className={`whitespace-pre-wrap outline-none empty:before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)] ${className ?? ""}`}
      style={style}
      onInput={emit}
      onFocus={onFocus}
      onBlur={() => {
        emit();
        onBlur?.();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPaste={(event) => {
        // Paste as plain text, then let the editor keep its own formatting.
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
        emit();
      }}
      onKeyDown={(event) => {
        const shortcut = textShortcutOf(event);
        if (!shortcut) return;
        event.preventDefault();
        event.stopPropagation();
        if (shortcut === "undo" || shortcut === "redo") {
          // Undo/redo must not re-read the DOM afterwards, otherwise the
          // restored value is immediately overwritten by the old text.
          const handler = shortcut === "undo" ? onUndo : onRedo;
          if (handler) {
            // Every keystroke is already emitted on input, so the history is
            // current — just step it back without re-reading the DOM.
            handler();
          } else {
            formatSelection(shortcut);
            emit();
          }
          return;
        }
        // Highlighted words, or the text typed next when nothing is selected.
        formatSelection(shortcut);
        emit();
      }}

    />
  );
}
