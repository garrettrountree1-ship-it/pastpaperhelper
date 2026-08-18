ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS vocab_translation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vocab_language text;

ALTER TABLE public.vocab_explanations
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'medium';

ALTER TABLE public.vocab_explanations
  DROP CONSTRAINT IF EXISTS vocab_explanations_assignment_id_term_language_key;

CREATE UNIQUE INDEX IF NOT EXISTS vocab_explanations_unique_key
  ON public.vocab_explanations (assignment_id, term, language, level);