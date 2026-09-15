-- Fast, deterministic marking settings.  The stored expected answer is created
-- from the mark-scheme OCR and remains visible/editable to the teacher.
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS expected_answer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS numerical_answer boolean NOT NULL DEFAULT false;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS check_final_numeric_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS check_final_numeric_only boolean;

ALTER TABLE public.student_assignment_settings
  ADD COLUMN IF NOT EXISTS check_final_numeric_only boolean;

-- Make the new fields available to PostgREST immediately after this migration.
NOTIFY pgrst, 'reload schema';
