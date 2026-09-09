ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS formative_leaderboard boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.formative_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);

GRANT SELECT ON public.formative_points TO authenticated;
GRANT ALL ON public.formative_points TO service_role;

ALTER TABLE public.formative_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Class members and teachers can view formative points"
ON public.formative_points FOR SELECT TO authenticated
USING (
  public.is_class_member(class_id, auth.uid())
  OR public.is_class_teacher(class_id, auth.uid())
);

CREATE OR REPLACE FUNCTION public.touch_formative_points()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_formative_points_updated_at
BEFORE UPDATE ON public.formative_points
FOR EACH ROW EXECUTE FUNCTION public.touch_formative_points();