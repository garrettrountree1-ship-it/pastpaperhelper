ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS source_page_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS answer_source_page_path text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.questions.source_page_path IS 'Teacher-only retained full source question-paper page used for cutting and recutting.';
COMMENT ON COLUMN public.questions.answer_source_page_path IS 'Teacher-only retained full source answer-key page used for cutting and recutting.';