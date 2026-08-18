# Four sections: Homework, Quizzes, Games, Class Materials

A big build. I'll ship it in four stages so you can test each one, starting with the navigation shell plus Class Materials, then Quizzes, then Games.

## Stage 1 — Section navigation shell

- After login, the dashboard shows 4 large blocks: **Class Materials**, **Homework**, **Quizzes**, **Games**.
- Picking one navigates to that section and the blocks collapse into a slim icon+label ribbon fixed on the left side, so switching sections is one click. On mobile the ribbon becomes a bottom bar.
- Same shell for teacher and student; each section renders the teacher or student variant based on role (demo account keeps its view switcher).
- Homework section = today's existing dashboard (classes, assignments, gradebook), moved under the new shell so nothing is lost.

## Stage 2 — Class Materials

- Teacher creates **units** inside a class (name, order) and uploads files into each unit: PPT/PPTX/PDF/DOCX, videos, images, plus optional link resources.
- Students see units as collapsible groups. Clicking a file opens an in-app viewer (PDF and images inline, video in a player, Office files rendered via download-or-preview fallback) and there's an explicit Download button.
- Files live in a new private storage bucket with signed URLs; only members of the class can read.
- Teacher can rename/delete units and remove files.

## Stage 3 — Quizzes (timed, in-class)

- Same past-paper + mark-scheme PDF upload and question extraction as homework — reuses the existing pipeline.
- Quiz-specific settings: total time limit (minutes), and toggles for "reveal mark scheme when time is up" and "show score when time is up".
- Quiz starts **locked**. Teacher presses **Release quiz** when the class is ready; a countdown starts for each student on open.
- During the quiz: no marking, no AI tutor, no right/wrong feedback, no vocab hints. Students type/upload answers and can revise freely until the timer ends.
- On timer end (or teacher "End quiz"), answers auto-submit, marking runs in one pass, and results plus optional mark scheme unlock.
- Teacher sees a live roster of who has started/finished, then normal gradebook-style results.

## Stage 4 — Games

**Shared pieces**
- Each student gets a permanent generated alias like `RunningTiger` (adjective + animal), unique per class, not editable by the student.
- **Leaderboard** per class showing aliases and token counts only.
- Token ledger records every award/deduction so history is auditable.
- Teacher controls: reset the whole leaderboard to 0, and add/deduct tokens for an individual student with a short reason.

**Game 1 — Head-to-head challenge (1 token)**
- Question drawn at random from past homework questions in the class.
- Timer per student = question marks in minutes (3 marks = 3 minutes), unlimited attempts inside that window.
- Matches are created either by teacher (random pairs) or by the platform pairing students with similar homework averages; both students get an invite.
- Whole match expires after 1 day. Fastest correct answer wins 1 token. If only one student attempts and gets it fully correct in time, they win. If neither is correct, no winner.

**Game 2 — Daily Double (2 tokens)**
- Once per day, within 5 minutes of the student logging in, a modal pops over whatever they're doing with a random homework question.
- Timer = marks in minutes, unlimited attempts. Fully correct in time = 2 tokens; otherwise the chance is gone until tomorrow.

Max 3 tokens per student per day.

## Technical notes

- New tables: `class_units`, `unit_materials`, `quizzes` (as assignments with `kind='quiz'` plus quiz settings columns), `game_profiles`, `game_matches`, `game_match_attempts`, `daily_doubles`, `token_ledger`. All with GRANTs and RLS scoped to class membership / teacher ownership.
- New private storage bucket `class-materials` with member-only signed-URL access.
- Game timing and win resolution are decided server-side in server functions (`games.functions.ts`) so clocks can't be gamed client-side; the same applies to quiz start/end times.
- Marking for quizzes and games reuses `marking.server.ts` in a "grade only, no tutoring" mode.
- Section shell lives in a new `_authenticated/app` layout with routes `/app/homework`, `/app/quizzes`, `/app/games`, `/app/materials`; existing assignment URLs keep working.
