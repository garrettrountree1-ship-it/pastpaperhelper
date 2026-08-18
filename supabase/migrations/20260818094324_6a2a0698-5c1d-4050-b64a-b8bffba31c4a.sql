CREATE TABLE public.assignment_vocab (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'English',
  terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, language)
);
GRANT ALL ON public.assignment_vocab TO service_role;
ALTER TABLE public.assignment_vocab ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.vocab_explanations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  term text NOT NULL,
  language text NOT NULL DEFAULT 'English',
  explanation text NOT NULL DEFAULT '',
  translation text NOT NULL DEFAULT '',
  image_urls text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, term, language)
);
GRANT ALL ON public.vocab_explanations TO service_role;
ALTER TABLE public.vocab_explanations ENABLE ROW LEVEL SECURITY;