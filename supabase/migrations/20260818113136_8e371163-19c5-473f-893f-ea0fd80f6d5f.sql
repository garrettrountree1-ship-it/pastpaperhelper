ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS keyword_translation boolean,
  ADD COLUMN IF NOT EXISTS vocab_translation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vocab_language text;

ALTER TABLE public.class_student_settings
  ADD COLUMN IF NOT EXISTS keyword_translation boolean;

ALTER TABLE public.student_assignment_settings
  ADD COLUMN IF NOT EXISTS keyword_translation boolean;