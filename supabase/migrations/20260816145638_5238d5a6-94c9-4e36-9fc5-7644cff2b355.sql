ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS time_spent_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mark_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;