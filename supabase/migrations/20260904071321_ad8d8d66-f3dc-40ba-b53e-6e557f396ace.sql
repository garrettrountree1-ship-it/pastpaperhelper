ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.class_units ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DROP POLICY IF EXISTS "students read class assignments" ON public.assignments;
CREATE POLICY "students read class assignments" ON public.assignments
FOR SELECT TO authenticated
USING (published AND archived_at IS NULL AND public.is_class_member(class_id, auth.uid()));

DROP POLICY IF EXISTS "Students view units in their classes" ON public.class_units;
CREATE POLICY "Students view units in their classes" ON public.class_units
FOR SELECT TO authenticated
USING (archived_at IS NULL AND public.is_class_member(class_id, auth.uid()));