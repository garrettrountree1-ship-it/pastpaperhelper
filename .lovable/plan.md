# Repair live lesson mirroring

## What will change
- Make the teacher's present-mode screen publish a complete live snapshot when mirroring starts, when a student joins, and as lesson content or view state changes.
- Keep students synchronized to the teacher's active lesson section, document, layout, zoom, scrolling, drawings, text, images, and annotations while mirroring is active.
- Lock the mirrored student screen so every lesson control and canvas/document interaction is unavailable except **Exit**.
- Stop mirroring immediately when the teacher turns it off or exits present mode, restoring normal student control.

## Technical details
- Harden the existing authenticated class Realtime channel lifecycle and snapshot request/response flow, including reconnect handling and stale-state cleanup.
- Apply view updates only for students currently in present mode and only from an authorized class teacher or co-teacher.
- Add a workspace-level interaction shield and simplify the student present toolbar during mirroring so only the exit action remains reachable.
- Verify the connection lifecycle and the locked/unlocked presentation states without changing lesson behavior outside present mode.
