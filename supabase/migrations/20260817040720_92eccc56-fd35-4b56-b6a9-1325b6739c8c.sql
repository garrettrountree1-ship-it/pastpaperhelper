ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS ai_flag_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_reason text;

CREATE TABLE IF NOT EXISTS public.integrity_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT '',
  excerpt text NOT NULL DEFAULT '',
  confidence numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integrity_flags TO authenticated;
GRANT ALL ON public.integrity_flags TO service_role;
ALTER TABLE public.integrity_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students see their own integrity flags"
ON public.integrity_flags FOR SELECT TO authenticated
USING (public.owns_submission(submission_id, auth.uid()));

CREATE POLICY "Teachers see integrity flags for their classes"
ON public.integrity_flags FOR SELECT TO authenticated
USING (public.teaches_submission(submission_id, auth.uid()));