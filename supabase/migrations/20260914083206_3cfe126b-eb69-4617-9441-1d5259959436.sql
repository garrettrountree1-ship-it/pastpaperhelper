ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS max_choice_attempts integer NOT NULL DEFAULT 1;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS max_choice_attempts integer;
ALTER TABLE public.student_assignment_settings ADD COLUMN IF NOT EXISTS max_choice_attempts integer;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS multiple_choice boolean;