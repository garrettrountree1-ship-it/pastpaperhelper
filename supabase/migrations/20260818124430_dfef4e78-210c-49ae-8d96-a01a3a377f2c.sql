CREATE TABLE public.class_game_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  game_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, game_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_game_settings TO authenticated;
GRANT ALL ON public.class_game_settings TO service_role;

ALTER TABLE public.class_game_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage their class game settings"
ON public.class_game_settings FOR ALL TO authenticated
USING (public.is_class_teacher(class_id, auth.uid()))
WITH CHECK (public.is_class_teacher(class_id, auth.uid()));

CREATE POLICY "Students read their class game settings"
ON public.class_game_settings FOR SELECT TO authenticated
USING (public.is_class_member(class_id, auth.uid()));