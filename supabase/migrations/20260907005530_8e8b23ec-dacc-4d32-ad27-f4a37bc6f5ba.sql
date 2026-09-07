CREATE TABLE public.question_help_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('hint','steps')),
  role text NOT NULL CHECK (role IN ('student','tutor')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX question_help_messages_lookup_idx
  ON public.question_help_messages (question_id, student_id, mode, created_at);

GRANT SELECT, INSERT ON public.question_help_messages TO authenticated;
GRANT ALL ON public.question_help_messages TO service_role;

ALTER TABLE public.question_help_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own help messages" ON public.question_help_messages
  FOR SELECT TO authenticated USING (student_id = auth.uid());

CREATE POLICY "Students add own help messages" ON public.question_help_messages
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers read class help messages" ON public.question_help_messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.questions q
      JOIN public.assignments a ON a.id = q.assignment_id
      WHERE q.id = question_help_messages.question_id
        AND public.is_class_teacher(a.class_id, auth.uid())
    )
  );