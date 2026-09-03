CREATE POLICY "coteachers read classes" ON public.classes FOR SELECT TO authenticated
  USING (public.is_class_coteacher(id, auth.uid()));

CREATE POLICY "coteachers update classes" ON public.classes FOR UPDATE TO authenticated
  USING (public.is_class_coteacher(id, auth.uid()))
  WITH CHECK (public.is_class_coteacher(id, auth.uid()));