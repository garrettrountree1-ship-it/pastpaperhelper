import { useEffect, useState } from "react";

/**
 * Deters copying and screenshotting of exam questions when the teacher turns
 * question protection on: blocks copy/cut/right-click/print and hides content
 * while the window is not focused (screenshot and screen-share tools take the
 * page after focus is lost).
 */
export function useContentProtection(enabled: boolean) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }

    const block = (event: Event) => event.preventDefault();
    const conceal = () => setHidden(true);
    const reveal = () => setHidden(false);
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const combo = event.metaKey || event.ctrlKey;
      if (
        key === "printscreen" ||
        (combo && ["c", "x", "p", "s"].includes(key)) ||
        (combo && event.shiftKey && ["s", "3", "4", "5"].includes(key))
      ) {
        event.preventDefault();
        setHidden(true);
        window.setTimeout(() => setHidden(false), 1200);
      }
    };

    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", conceal);
    window.addEventListener("focus", reveal);
    document.addEventListener("visibilitychange", () =>
      document.hidden ? conceal() : reveal(),
    );

    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", reveal);
    };
  }, [enabled]);

  return {
    /** True while the questions should be masked. */
    concealed: enabled && hidden,
    /** Class names to spread on the protected container. */
    protectedClassName: enabled ? "select-none [-webkit-touch-callout:none] print:invisible" : "",
  };
}
