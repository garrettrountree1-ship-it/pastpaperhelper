# Responsive formative assessment layout

## What will change
- Replace the two independently positioned popups with one coordinated responsive layout so they cannot overlap.
- On tablets and laptops, show the leaderboard and question side by side, with each panel constrained to the available width and height.
- On phones, show a compact Question / Leaderboard switch and display only the selected panel.
- Keep live scores, answering, timers, and teacher controls unchanged.

## Technical details
- Update the formative assessment panel and leaderboard presentation in `FormativeCheck.tsx`.
- Use responsive grid sizing, `min-w-0`, and viewport-height scrolling for tablet and laptop widths.
- Add local phone-view state and accessible segmented controls using the existing button component.
- Verify the student display at phone, tablet, and laptop widths.
