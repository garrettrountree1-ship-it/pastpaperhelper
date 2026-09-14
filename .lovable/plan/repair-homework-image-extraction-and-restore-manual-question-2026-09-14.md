# Repair homework image extraction and restore manual question text

## What will change
- Keep automatic extraction image-first: every detected question and official answer will be cut from the uploaded page, not reconstructed as extracted text.
- Detect questions even when numbering restarts, as in teacher-made compilations, instead of treating repeated numbers as duplicates.
- Detect inline answer lines such as `Mark scheme 1 = A` immediately below a question and save that exact line as the answer image.
- Prevent the independent crop check from deleting a valid first-question crop merely because it omitted an item.
- On every question, let the teacher remove the question picture and type the question instead; students will then see that teacher-entered wording.
- Keep official answers image-only for marking and release.

## Technical details
- Strengthen the inventory, second-pass, detail, and answer cross-check instructions for repeated labels and inline mark schemes.
- Match extraction results to inventory entries by occurrence and page, not label alone, and avoid global label deduplication.
- Preserve valid first-pass crops when the crop audit does not return that specific item; only replace crops the audit explicitly reports.
- Add the manual question textarea to the existing no-image editor state and adjust save validation while retaining the question label controls.
- Add focused regression tests for repeated question numbers, first-item preservation, and thin inline-answer crops.
- Validate the uploaded Unit 2 Atomic Structure document case and the homework editor behavior.
