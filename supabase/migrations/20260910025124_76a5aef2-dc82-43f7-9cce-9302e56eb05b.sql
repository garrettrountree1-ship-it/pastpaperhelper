ALTER TABLE public.class_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.class_messages(id) ON DELETE SET NULL;

CREATE POLICY "teacher deletes class messages" ON public.class_messages FOR DELETE
  TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid()));

CREATE POLICY "student deletes own messages" ON public.class_messages FOR DELETE
  TO authenticated
  USING (student_id = auth.uid() AND sender_id = auth.uid() AND sender_role = 'student');

GRANT SELECT, INSERT, DELETE ON public.class_messages TO authenticated;
GRANT ALL ON public.class_messages TO service_role;