ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS mark_scheme_revealed boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.student_assignment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_at timestamptz,
  mark_scheme_revealed boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

GRANT SELECT ON public.student_assignment_settings TO authenticated;
GRANT ALL ON public.student_assignment_settings TO service_role;

ALTER TABLE public.student_assignment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student reads own assignment settings"
  ON public.student_assignment_settings FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "teacher manages assignment settings"
  ON public.student_assignment_settings FOR ALL TO authenticated
  USING (public.can_teach_assignment(assignment_id, auth.uid()))
  WITH CHECK (public.can_teach_assignment(assignment_id, auth.uid()));