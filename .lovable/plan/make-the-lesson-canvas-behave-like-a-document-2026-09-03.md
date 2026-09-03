# Make the lesson canvas behave like a document

## Changes
- Stop Backspace/Delete from removing an entire text block while its editor—or any nested editable control—is active. Normal typing, selection, copy, paste, and character deletion will remain inside the focused text.
- Keep every existing text block directly editable: clicking its words places the caret, highlighting supports formatting, and the move/resize controls stay separate from text editing.
- Replace additive “grow near bottom” state with a stable document-height model. The canvas will extend by one viewport-sized section only when the user reaches the bottom, will never snap upward, and scrolling back up will not grow or resize the scrollbar again.
- Preserve the current scroll position and document height through edits, zoom changes, and autosaves so the page does not bounce.
- Verify Backspace, editing existing words, formatting a selection, and repeated bottom scrolling in the live lesson canvas.

## Technical details
- Harden keyboard target detection around `contenteditable`, selections, and toolbar controls.
- Track a monotonic canvas extent from the scroll container rather than incrementing height on both `scroll` and `wheel` events.
- Keep the existing rich-text HTML and plain-text values synchronized without rewriting the active DOM or moving the caret.
