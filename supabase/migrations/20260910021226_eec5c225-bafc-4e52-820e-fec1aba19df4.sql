ALTER TABLE public.student_assignment_settings
  ALTER COLUMN mark_scheme_revealed DROP NOT NULL,
  ALTER COLUMN mark_scheme_revealed DROP DEFAULT;

UPDATE public.student_assignment_settings
SET mark_scheme_revealed = NULL
WHERE mark_scheme_revealed = false;

COMMENT ON COLUMN public.student_assignment_settings.mark_scheme_revealed IS
  'Nullable student override: NULL inherits assignment setting, true enables, false disables.';

COMMENT ON COLUMN public.student_assignment_settings.reveal_on_full_marks IS
  'Nullable student override: NULL inherits assignment setting, true enables, false disables.';