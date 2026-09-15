ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS expected_answer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS numerical_answer boolean NOT NULL DEFAULT false;