import { useEffect, useState } from "react";

/**
 * Deters copying and screenshotting of exam questions.
 *
 * Screen-capture deterrence (screenshot keys, snipping-tool shortcuts,
 * printing, and hiding the questions whenever the window loses focus) is
 * always on inside a homework assignment. Blocking selection / copying of the
 * question wording is optional and set per assignment by the teacher.
 */
/** True when the user is typing in a field, where copy/paste must keep working. */
function isEditable(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    Boolean(el.closest?.("input, textarea, [contenteditable='true']"))
  );
}

export function useContentProtection(
  options: boolean | { blockCopy?: boolean; blockCapture?: boolean } = {},
) {
  const blockCopy = typeof options === "boolean" ? options : Boolean(options.blockCopy);
  const blockCapture =
    typeof options === "boolean" ? options : options.blockCapture !== false;
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!blockCopy && !blockCapture) {
      setHidden(false);
      return;
    }

    const block = (event: Event) => {
      if (isEditable(event.target)) return;
      event.preventDefault();
    };

    const conceal = () => setHidden(true);
    const reveal = () => setHidden(false);
    const onVisibility = () => (document.hidden ? conceal() : reveal());
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const combo = event.metaKey || event.ctrlKey;
      const captureCombo =
        key === "printscreen" ||
        // Windows Snipping Tool (Win/Shift+S) and macOS screenshot shortcuts
        (event.shiftKey && (combo || event.getModifierState?.("Meta")) && ["s", "3", "4", "5"].includes(key)) ||
        (combo && ["p", "s"].includes(key) && !isEditable(event.target));
      const copyCombo = combo && ["c", "x"].includes(key) && !isEditable(event.target);

      if ((blockCapture && captureCombo) || (blockCopy && copyCombo)) {
        event.preventDefault();
        setHidden(true);
        window.setTimeout(() => setHidden(false), 1200);
      }
    };

    if (blockCopy) {
      document.addEventListener("copy", block);
      document.addEventListener("cut", block);
      document.addEventListener("contextmenu", block);
      document.addEventListener("dragstart", block);
    }
    document.addEventListener("keydown", onKey);
    if (blockCapture) {
      window.addEventListener("blur", conceal);
      window.addEventListener("focus", reveal);
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", reveal);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [blockCopy, blockCapture]);

  return {
    /** True while the questions should be masked. */
    concealed: hidden,
    /** Class names to spread on the protected container. */
    protectedClassName: [
      blockCopy ? "select-none [-webkit-touch-callout:none]" : "",
      blockCapture ? "print:invisible" : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
