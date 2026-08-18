CREATE TABLE public.game_rounds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('vocab_bingo','boss','wager')),
  day date NOT NULL DEFAULT current_date,
  question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  wager integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  answer_text text NOT NULL DEFAULT '',
  correct boolean NOT NULL DEFAULT false,
  awarded integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  finished_at timestamptz
);

CREATE UNIQUE INDEX game_rounds_one_per_day ON public.game_rounds (student_id, kind, day);
CREATE INDEX game_rounds_class_idx ON public.game_rounds (class_id, kind);

GRANT SELECT ON public.game_rounds TO authenticated;
GRANT ALL ON public.game_rounds TO service_role;

ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read their own game rounds"
ON public.game_rounds FOR SELECT TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Teachers read rounds in their classes"
ON public.game_rounds FOR SELECT TO authenticated
USING (public.is_class_teacher(class_id, auth.uid()));