ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS allow_hint boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_steps boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_answer_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS allow_hint boolean,
  ADD COLUMN IF NOT EXISTS allow_steps boolean,
  ADD COLUMN IF NOT EXISTS max_answer_attempts integer;

ALTER TABLE public.student_assignment_settings
  ADD COLUMN IF NOT EXISTS allow_hint boolean,
  ADD COLUMN IF NOT EXISTS allow_steps boolean,
  ADD COLUMN IF NOT EXISTS max_answer_attempts integer;