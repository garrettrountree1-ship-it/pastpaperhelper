# Pinch zoom for lesson documents and canvas

## What will change
- Add smooth two-finger pinch zoom inside PDF, Word, PowerPoint, and lesson-canvas windows.
- Keep the point between the teacher's fingers fixed while zooming, so content does not jump.
- Let one finger move around the document or canvas while a pen or mouse continues to handle drawing.
- Keep trackpad pinch zoom and the existing zoom buttons working consistently.

## Technical details
- Create one shared zoom-and-pan hook with bounded scaling, cursor/finger anchoring, non-passive wheel handling, and two-pointer touch tracking.
- Replace the duplicated zoom handlers in the PDF, Office, and canvas viewers with the shared behavior.
- Preserve existing lesson mirroring, document annotations, canvas coordinates, scrolling, and toolbar controls.
- Verify mousepad pinch and touch gestures in the rendered lesson workspace without page-level zoom or accidental marks.
