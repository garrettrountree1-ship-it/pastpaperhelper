CREATE TABLE public.class_coteachers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (class_id, teacher_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_coteachers TO authenticated;
GRANT ALL ON public.class_coteachers TO service_role;

ALTER TABLE public.class_coteachers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_class_owner(_class_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.classes where id = _class_id and teacher_id = _user_id) end
$$;

CREATE OR REPLACE FUNCTION public.is_class_coteacher(_class_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.class_coteachers where class_id = _class_id and teacher_id = _user_id) end
$$;

CREATE POLICY "Class owner manages coteachers"
ON public.class_coteachers FOR ALL TO authenticated
USING (public.is_class_owner(class_id, auth.uid()))
WITH CHECK (public.is_class_owner(class_id, auth.uid()));

CREATE POLICY "Coteachers can see their own entry"
ON public.class_coteachers FOR SELECT TO authenticated
USING (teacher_id = auth.uid());

-- Teaching access now covers coteachers everywhere is_class_teacher / can_teach_* is used.
CREATE OR REPLACE FUNCTION public.is_class_teacher(_class_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.classes where id = _class_id and teacher_id = _user_id)
      or exists (select 1 from public.class_coteachers where class_id = _class_id and teacher_id = _user_id) end
$$;

CREATE OR REPLACE FUNCTION public.can_teach_assignment(_assignment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.assignments a where a.id = _assignment_id
      and public.is_class_teacher(a.class_id, _user_id)) end
$$;

CREATE OR REPLACE FUNCTION public.can_teach_quiz(_quiz_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.quizzes q where q.id = _quiz_id
      and public.is_class_teacher(q.class_id, _user_id)) end
$$;

CREATE OR REPLACE FUNCTION public.teaches_submission(_submission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.submissions s join public.assignments a on a.id = s.assignment_id
      where s.id = _submission_id and public.is_class_teacher(a.class_id, _user_id)) end
$$;

CREATE OR REPLACE FUNCTION public.teaches_answer(_answer_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.answers an join public.submissions s on s.id = an.submission_id
      join public.assignments a on a.id = s.assignment_id
      where an.id = _answer_id and public.is_class_teacher(a.class_id, _user_id)) end
$$;

CREATE OR REPLACE FUNCTION public.teaches_quiz_attempt(_attempt_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.quiz_attempts at join public.quizzes q on q.id = at.quiz_id
      where at.id = _attempt_id and public.is_class_teacher(q.class_id, _user_id)) end
$$;