# Safer question crops and manual recutting

## What will change

- Tighten automatic cropping so a question ends in the first safe white space immediately after its printed mark value, such as `[1]` or `(2)`, and never extends into an answer or mark-scheme block.
- Replace the current “nearest row” adjustment with a stricter blank-band check. A cut will only be accepted across a continuous white strip, preventing letters, symbols, tables, graphs, and diagrams from being sliced.
- Preserve printed hierarchy when assigning labels. A standalone `(a)`, `b`, `(ii)`, etc. following question `1` will inherit the active main number and display as `1(a)`, `1(b)`, `1(b)(ii)` rather than becoming question `2` or `3`.
- Add a teacher-only **Recut** action beside every question image in:
  - the assignment question editor on the Homework page;
  - the teacher’s Student view preview.
- The recut window will show the complete original page, shade the excluded areas, and provide draggable top and bottom cut lines. For a question spanning pages, the teacher can select and adjust each page piece separately.
- Saving a recut from the preview updates that question immediately. Saving from the question editor updates its draft and is committed with **Save changes**.

## Existing papers

- Existing saved crop links already point to their original full-page pictures, so the recut window will work for assignments already uploaded.
- The stricter whitespace adjustment and improved displayed labels will apply when existing assignments are opened; no re-upload is required.
- Existing saved crop coordinates will not be bulk-guessed or destructively overwritten. Teachers can inspect and save corrections using **Recut**, avoiding an automated repair that could expose an answer on a mixed page.

## Technical details

- Add shared helpers for parsing/rebuilding crop fragments while preserving signed image URLs.
- Add a reusable teacher crop editor with pointer/keyboard-accessible handles and a live cropped preview.
- Add an authenticated teacher-only function that validates ownership, page identity, and crop bounds before updating a question’s saved image paths.
- Strengthen extraction instructions and crop parsing for mark-value boundaries.
- Correct whitespace scanning to require a genuine run of blank rows and choose the closest safe inward boundary before any outward expansion.
- Extend question-label parsing/normalisation to carry letter and Roman-numeral subparts under their preceding main question.
- Add focused tests for crop URL rebuilding, whitespace-safe boundaries, and hierarchical labels; then verify the editor and preview at desktop and mobile widths.
