CREATE TABLE public.formative_checks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  section_id uuid,
  teacher_id uuid not null,
  question text not null,
  expected_answer text,
  seconds integer not null default 60,
  ends_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
CREATE INDEX formative_checks_class_idx ON public.formative_checks (class_id, created_at desc);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formative_checks TO authenticated;
GRANT ALL ON public.formative_checks TO service_role;
ALTER TABLE public.formative_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage their class checks" ON public.formative_checks FOR ALL TO authenticated
USING (teacher_id = auth.uid() AND exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()))
WITH CHECK (teacher_id = auth.uid() AND exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid()));

CREATE POLICY "Class members read checks" ON public.formative_checks FOR SELECT TO authenticated
USING (exists (select 1 from public.class_members m where m.class_id = formative_checks.class_id and m.student_id = auth.uid()));

CREATE TABLE public.formative_responses (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.formative_checks(id) on delete cascade,
  student_id uuid not null,
  answer text not null,
  verdict text not null,
  feedback text,
  attempt integer not null default 1,
  created_at timestamptz not null default now()
);
CREATE INDEX formative_responses_check_idx ON public.formative_responses (check_id, created_at desc);
GRANT SELECT, INSERT ON public.formative_responses TO authenticated;
GRANT ALL ON public.formative_responses TO service_role;
ALTER TABLE public.formative_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students insert own responses" ON public.formative_responses FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students read own responses" ON public.formative_responses FOR SELECT TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Teacher reads class responses" ON public.formative_responses FOR SELECT TO authenticated
USING (exists (select 1 from public.formative_checks fc where fc.id = check_id and fc.teacher_id = auth.uid()));