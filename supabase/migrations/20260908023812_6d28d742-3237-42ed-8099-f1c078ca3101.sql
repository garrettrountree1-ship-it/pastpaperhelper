ALTER TABLE public.formative_checks
  ADD COLUMN IF NOT EXISTS answer_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_answer text;