-- 1. Signup trigger routine should never be callable from the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2. Helper predicates: keep callable by authenticated (required by RLS policies)
--    but hard-scope them to the caller so they cannot probe other users.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.user_roles where user_id = _user_id and role = _role) end
$$;

CREATE OR REPLACE FUNCTION public.is_class_member(_class_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.class_members where class_id = _class_id and student_id = _user_id) end
$$;

CREATE OR REPLACE FUNCTION public.is_class_teacher(_class_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.classes where id = _class_id and teacher_id = _user_id) end
$$;

CREATE OR REPLACE FUNCTION public.can_study_assignment(_assignment_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.assignments a join public.class_members m on m.class_id = a.class_id
      where a.id = _assignment_id and m.student_id = _user_id) end
$$;

CREATE OR REPLACE FUNCTION public.can_teach_assignment(_assignment_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.assignments a join public.classes c on c.id = a.class_id
      where a.id = _assignment_id and c.teacher_id = _user_id) end
$$;

CREATE OR REPLACE FUNCTION public.owns_submission(_submission_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.submissions where id = _submission_id and student_id = _user_id) end
$$;

CREATE OR REPLACE FUNCTION public.teaches_submission(_submission_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.submissions s join public.assignments a on a.id = s.assignment_id
      join public.classes c on c.id = a.class_id where s.id = _submission_id and c.teacher_id = _user_id) end
$$;

CREATE OR REPLACE FUNCTION public.owns_answer(_answer_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.answers an join public.submissions s on s.id = an.submission_id
      where an.id = _answer_id and s.student_id = _user_id) end
$$;

CREATE OR REPLACE FUNCTION public.teaches_answer(_answer_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select case when auth.uid() is null or _user_id is distinct from auth.uid() then false
    else exists (select 1 from public.answers an join public.submissions s on s.id = an.submission_id
      join public.assignments a on a.id = s.assignment_id join public.classes c on c.id = a.class_id
      where an.id = _answer_id and c.teacher_id = _user_id) end
$$;

-- 3. Signed-out visitors must not be able to call these at all.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_class_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_class_teacher(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_study_assignment(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_teach_assignment(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_submission(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teaches_submission(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_answer(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.teaches_answer(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_class_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_class_teacher(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_study_assignment(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_teach_assignment(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_submission(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.teaches_submission(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_answer(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.teaches_answer(uuid, uuid) TO authenticated, service_role;