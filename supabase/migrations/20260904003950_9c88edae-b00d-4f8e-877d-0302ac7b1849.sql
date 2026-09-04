ALTER TABLE public.formative_checks ADD COLUMN IF NOT EXISTS target_student_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE public.formative_checks
SET target_student_ids = ARRAY[target_student_id]
WHERE target_student_id IS NOT NULL AND target_student_ids = '{}'::uuid[];