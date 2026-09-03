ALTER TABLE public.formative_checks
  ADD COLUMN IF NOT EXISTS target_student_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS formative_checks_target_student_idx
  ON public.formative_checks (class_id, target_student_id);