# Fix class mirror re-entry

## Changes
- Load saved class code, roster name, and viewer seat after the page is ready so they cannot leave the join form in a mismatched state.
- Keep **Watch class** usable during a stalled attempt, and let a new tap replace the stalled attempt instead of leaving a grey button.
- Make seat takeover atomic so reopening a closed/crashed viewer cannot fail between deleting and recreating the student's seat.
- Verify a saved-name re-entry and repeated join against the running preview.

## Technical details
- Track join attempts and ignore stale responses.
- Refresh an existing `mirror_claims` row in place with a new token instead of delete-then-insert.
- Preserve no-login access and do not touch the student's signed-in session in other tabs.
