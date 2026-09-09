ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS exam_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_paper_submissions integer NOT NULL DEFAULT 0;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS exam_mode boolean,
  ADD COLUMN IF NOT EXISTS max_paper_submissions integer;

ALTER TABLE public.student_assignment_settings
  ADD COLUMN IF NOT EXISTS exam_mode boolean,
  ADD COLUMN IF NOT EXISTS max_paper_submissions integer;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS submit_count integer NOT NULL DEFAULT 0;

UPDATE public.submissions SET submit_count = 1 WHERE submitted_at IS NOT NULL AND submit_count = 0;