-- ============================================================ QUIZZES ====
CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  subject text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  time_limit_minutes integer NOT NULL DEFAULT 30,
  reveal_mark_scheme boolean NOT NULL DEFAULT true,
  show_score boolean NOT NULL DEFAULT true,
  released_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  question_text text NOT NULL,
  mark_scheme text NOT NULL,
  marks integer NOT NULL DEFAULT 1,
  image_paths text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress',
  awarded_marks numeric NOT NULL DEFAULT 0,
  total_marks integer NOT NULL DEFAULT 0,
  UNIQUE (quiz_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  answer_text text NOT NULL DEFAULT '',
  image_paths text[] NOT NULL DEFAULT '{}',
  awarded_marks numeric NOT NULL DEFAULT 0,
  verdict text,
  feedback text,
  mark_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_answers TO authenticated;
GRANT ALL ON public.quiz_answers TO service_role;
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_teach_quiz(_quiz_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quizzes q
    JOIN public.classes c ON c.id = q.class_id
    WHERE q.id = _quiz_id AND c.teacher_id = _user_id
  )
$$;
REVOKE ALL ON FUNCTION public.can_teach_quiz(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_teach_quiz(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_study_quiz(_quiz_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quizzes q
    JOIN public.class_members m ON m.class_id = q.class_id
    WHERE q.id = _quiz_id AND m.student_id = _user_id AND q.released_at IS NOT NULL
  )
$$;
REVOKE ALL ON FUNCTION public.can_study_quiz(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_study_quiz(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.owns_quiz_attempt(_attempt_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.quiz_attempts a WHERE a.id = _attempt_id AND a.student_id = _user_id)
$$;
REVOKE ALL ON FUNCTION public.owns_quiz_attempt(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_quiz_attempt(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.teaches_quiz_attempt(_attempt_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quiz_attempts a
    JOIN public.quizzes q ON q.id = a.quiz_id
    JOIN public.classes c ON c.id = q.class_id
    WHERE a.id = _attempt_id AND c.teacher_id = _user_id
  )
$$;
REVOKE ALL ON FUNCTION public.teaches_quiz_attempt(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaches_quiz_attempt(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "Teachers manage own class quizzes" ON public.quizzes FOR ALL TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid()))
  WITH CHECK (public.is_class_teacher(class_id, auth.uid()));
CREATE POLICY "Students read released quizzes" ON public.quizzes FOR SELECT TO authenticated
  USING (released_at IS NOT NULL AND public.is_class_member(class_id, auth.uid()));

CREATE POLICY "Teachers manage quiz questions" ON public.quiz_questions FOR ALL TO authenticated
  USING (public.can_teach_quiz(quiz_id, auth.uid()))
  WITH CHECK (public.can_teach_quiz(quiz_id, auth.uid()));
CREATE POLICY "Students read released quiz questions" ON public.quiz_questions FOR SELECT TO authenticated
  USING (public.can_study_quiz(quiz_id, auth.uid()));

CREATE POLICY "Students read own quiz attempts" ON public.quiz_attempts FOR SELECT TO authenticated
  USING (student_id = auth.uid());
CREATE POLICY "Teachers read class quiz attempts" ON public.quiz_attempts FOR SELECT TO authenticated
  USING (public.can_teach_quiz(quiz_id, auth.uid()));

CREATE POLICY "Students read own quiz answers" ON public.quiz_answers FOR SELECT TO authenticated
  USING (public.owns_quiz_attempt(attempt_id, auth.uid()));
CREATE POLICY "Teachers read class quiz answers" ON public.quiz_answers FOR SELECT TO authenticated
  USING (public.teaches_quiz_attempt(attempt_id, auth.uid()));

-- ============================================================== GAMES ====
CREATE TABLE public.game_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id),
  alias text NOT NULL,
  tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id),
  UNIQUE (class_id, alias)
);
GRANT SELECT ON public.game_profiles TO authenticated;
GRANT ALL ON public.game_profiles TO service_role;
ALTER TABLE public.game_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Class members read aliases" ON public.game_profiles FOR SELECT TO authenticated
  USING (public.is_class_member(class_id, auth.uid()) OR public.is_class_teacher(class_id, auth.uid()));

CREATE TABLE public.token_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id),
  delta integer NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.token_ledger TO authenticated;
GRANT ALL ON public.token_ledger TO service_role;
ALTER TABLE public.token_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read own token history" ON public.token_ledger FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_class_teacher(class_id, auth.uid()));

CREATE TABLE public.game_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  created_by uuid,
  student_a uuid NOT NULL REFERENCES auth.users(id),
  student_b uuid NOT NULL REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL,
  winner_id uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.game_matches TO authenticated;
GRANT ALL ON public.game_matches TO service_role;
ALTER TABLE public.game_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players and teacher read matches" ON public.game_matches FOR SELECT TO authenticated
  USING (student_a = auth.uid() OR student_b = auth.uid() OR public.is_class_teacher(class_id, auth.uid()));

CREATE TABLE public.game_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.game_matches(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id),
  attempts integer NOT NULL DEFAULT 0,
  correct boolean NOT NULL DEFAULT false,
  seconds numeric,
  answer_text text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  finished_at timestamptz,
  UNIQUE (match_id, student_id)
);
GRANT SELECT ON public.game_attempts TO authenticated;
GRANT ALL ON public.game_attempts TO service_role;
ALTER TABLE public.game_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own game attempts readable" ON public.game_attempts FOR SELECT TO authenticated
  USING (student_id = auth.uid());

CREATE TABLE public.daily_doubles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  correct boolean NOT NULL DEFAULT false,
  awarded integer NOT NULL DEFAULT 0,
  answer_text text NOT NULL DEFAULT '',
  finished_at timestamptz,
  UNIQUE (student_id, day)
);
GRANT SELECT ON public.daily_doubles TO authenticated;
GRANT ALL ON public.daily_doubles TO service_role;
ALTER TABLE public.daily_doubles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own daily double readable" ON public.daily_doubles FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- ============================================================== ADMIN ====
CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  section text NOT NULL,
  seconds integer NOT NULL DEFAULT 0,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users record own activity" ON public.activity_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users read own activity" ON public.activity_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  email text NOT NULL DEFAULT '',
  body text NOT NULL,
  reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  replied_at timestamptz
);
GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own support messages" ON public.support_messages FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users send support messages" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_activity_events_user_day ON public.activity_events (occurred_at, section);
CREATE INDEX idx_token_ledger_class ON public.token_ledger (class_id, created_at DESC);
CREATE INDEX idx_quiz_attempts_quiz ON public.quiz_attempts (quiz_id);