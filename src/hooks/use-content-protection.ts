import { useEffect, useState } from "react";

/**
 * Deters copying and screenshotting of exam questions.
 *
 * Screen-capture deterrence (screenshot keys, snipping-tool shortcuts,
 * printing, and hiding the questions whenever the window loses focus) is
 * always on inside a homework assignment. Blocking selection / copying of the
 * question wording is optional and set per assignment by the teacher.
 */
/** True when the user is typing in a field, where their own text may be copied. */
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

/** A DOM-level mask painted synchronously, before React can re-render. */
const OVERLAY_ID = "pph-capture-mask";
function showOverlay() {
  if (typeof document === "undefined") return;
  let el = document.getElementById(OVERLAY_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:#111;color:#fff;display:flex;" +
      "align-items:center;justify-content:center;font:600 16px/1.4 system-ui,sans-serif;" +
      "text-align:center;padding:24px;";
    el.textContent = "Screen capture is not allowed on homework.";
    document.body.appendChild(el);
  }
  el.style.display = "flex";
}
function hideOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

export function useContentProtection(
  options: boolean | { blockCopy?: boolean; blockCapture?: boolean; blockPaste?: boolean } = {},
) {
  const blockCopy = typeof options === "boolean" ? options : Boolean(options.blockCopy);
  const blockCapture = typeof options === "boolean" ? options : options.blockCapture !== false;
  const blockPaste = typeof options === "boolean" ? options : options.blockPaste !== false;
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!blockCopy && !blockCapture && !blockPaste) {
      setHidden(false);
      return;
    }

    const block = (event: Event) => {
      if (isEditable(event.target)) return;
      event.preventDefault();
    };
    const blockEveryPaste = (event: ClipboardEvent) => event.preventDefault();

    const conceal = () => setHidden(true);
    const reveal = () => {
      hideOverlay();
      setHidden(false);
    };
    const onVisibility = () => (document.hidden ? conceal() : reveal());

    /** Print Screen copies the screen at the OS level, so the best we can do is
     * blank the questions the moment the key is touched and wipe whatever the
     * OS just placed on the clipboard. */
    const scrubClipboard = () => {
      try {
        void navigator.clipboard?.writeText?.(
          "Screen capture of homework questions is not allowed.",
        );
      } catch {
        /* clipboard permission denied — nothing else we can do */
      }
    };
    let revealTimer = 0;
    const onCapture = () => {
      // Paint the mask synchronously — a React re-render is one frame too slow.
      showOverlay();
      setHidden(true);
      for (const delay of [0, 60, 200, 500, 1200, 2500]) {
        window.setTimeout(scrubClipboard, delay);
      }
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(reveal, 2500);
    };

    const isPrintScreen = (event: KeyboardEvent) =>
      event.key === "PrintScreen" ||
      event.code === "PrintScreen" ||
      event.keyCode === 44 ||
      event.key === "F13" ||
      // Some keyboards/layouts report the key with no name at all.
      event.code === "F13" ||
      event.code === "Snapshot";

    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const combo = event.metaKey || event.ctrlKey;
      const captureCombo =
        key === "printscreen" ||
        // Windows Snipping Tool (Win/Shift+S) and macOS screenshot shortcuts
        (event.shiftKey &&
          (combo || event.getModifierState?.("Meta")) &&
          ["s", "3", "4", "5"].includes(key)) ||
        (combo && ["p", "s"].includes(key) && !isEditable(event.target));
      const copyCombo = combo && ["c", "x"].includes(key) && !isEditable(event.target);

      if ((blockCapture && captureCombo) || (blockCopy && copyCombo)) {
        event.preventDefault();
        onCapture();
      }
    };

    // Chrome/Edge on Windows only surface Print Screen on keyup.
    const onKeyUp = (event: KeyboardEvent) => {
      if (blockCapture && isPrintScreen(event)) onCapture();
    };
    // Fires before React can render: mask via direct DOM in the capture phase.
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (!blockCapture) return;
      // Pre-emptively mask as soon as the Windows key or Print Screen is touched.
      if (isPrintScreen(event) || event.key === "Meta" || event.getModifierState?.("Meta")) {
        onCapture();
      }
    };
    // Capture overlays (snipping tool, screen recorders) can steal focus without
    // firing blur, so poll for it as a backstop.
    const focusPoll = blockCapture
      ? window.setInterval(() => {
          if (!document.hasFocus()) conceal();
        }, 200)
      : 0;

    // --- Phones and tablets -------------------------------------------------
    // Mobile browsers never tell a web page that a screenshot was taken, so we
    // mask on every signal that usually accompanies one: three-finger gestures
    // (Android/iPad screenshot swipes), the app switcher, the page being frozen
    // or backgrounded, and screen-recording starting.
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 3) onCapture();
    };
    const onPageHide = () => conceal();
    // A two-finger pinch (gesturestart on iOS/iPadOS) is zooming, not a
    // screenshot — let it through untouched. Genuine screenshot signals remain
    // masked: three-finger swipes, focus loss, and the page being hidden.
    const onGesture = (event: Event) => {
      if (isEditable(event.target)) return;
      // Do not preventDefault or mask here: students must be able to pinch to
      // zoom in and out of their paper without the screen blacking out.
    };

    if (blockCopy) {
      document.addEventListener("copy", block);
      document.addEventListener("cut", block);
      document.addEventListener("contextmenu", block);
      document.addEventListener("dragstart", block);
    }
    if (blockPaste) document.addEventListener("paste", blockEveryPaste, true);
    document.addEventListener("keydown", onKey);
    if (blockCapture) {
      document.addEventListener("keydown", onKeyDownCapture, true);
      document.addEventListener("keyup", onKeyUp, true);
      window.addEventListener("blur", conceal);
      window.addEventListener("focus", reveal);
      document.addEventListener("visibilitychange", onVisibility);
      document.addEventListener("touchstart", onTouchStart, { passive: true });
      document.addEventListener("gesturestart", onGesture);
      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("pageshow", reveal);
      document.addEventListener("resume", reveal);
      document.addEventListener("freeze", onPageHide);
    }

    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("paste", blockEveryPaste, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keydown", onKeyDownCapture, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", reveal);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("gesturestart", onGesture);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", reveal);
      document.removeEventListener("resume", reveal);
      document.removeEventListener("freeze", onPageHide);
      window.clearInterval(focusPoll);
      window.clearTimeout(revealTimer);
      hideOverlay();
    };
  }, [blockCopy, blockCapture, blockPaste]);

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
