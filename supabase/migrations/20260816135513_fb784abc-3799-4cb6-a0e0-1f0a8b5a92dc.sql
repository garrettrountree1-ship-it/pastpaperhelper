-- roles
create type public.app_role as enum ('teacher','student');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "teachers read profiles" on public.profiles for select to authenticated using (public.has_role(auth.uid(),'teacher'));
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own roles read" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "teachers read roles" on public.user_roles for select to authenticated using (public.has_role(auth.uid(),'teacher'));

-- auto profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), new.email)
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, case when coalesce(new.raw_user_meta_data->>'role','student') = 'teacher' then 'teacher'::public.app_role else 'student'::public.app_role end)
  on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- classes
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  curriculum text not null default 'IGCSE',
  subject text not null default '',
  join_code text not null unique,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.classes to authenticated;
grant all on public.classes to service_role;
alter table public.classes enable row level security;

create table public.class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (class_id, student_id)
);
grant select, insert, delete on public.class_members to authenticated;
grant all on public.class_members to service_role;
alter table public.class_members enable row level security;

create or replace function public.is_class_teacher(_class_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes where id = _class_id and teacher_id = _user_id)
$$;

create or replace function public.is_class_member(_class_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members where class_id = _class_id and student_id = _user_id)
$$;

create policy "teacher manages classes" on public.classes for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy "members read classes" on public.classes for select to authenticated
  using (public.is_class_member(id, auth.uid()));

create policy "student reads own membership" on public.class_members for select to authenticated
  using (student_id = auth.uid());
create policy "teacher reads memberships" on public.class_members for select to authenticated
  using (public.is_class_teacher(class_id, auth.uid()));
create policy "teacher removes memberships" on public.class_members for delete to authenticated
  using (public.is_class_teacher(class_id, auth.uid()));

-- assignments
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subject text not null default '',
  curriculum text not null default 'IGCSE',
  instructions text,
  due_at timestamptz,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.assignments to authenticated;
grant all on public.assignments to service_role;
alter table public.assignments enable row level security;

create policy "teacher manages assignments" on public.assignments for all to authenticated
  using (public.is_class_teacher(class_id, auth.uid())) with check (public.is_class_teacher(class_id, auth.uid()));
create policy "students read class assignments" on public.assignments for select to authenticated
  using (published and public.is_class_member(class_id, auth.uid()));

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  position int not null default 1,
  question_text text not null,
  mark_scheme text not null,
  marks int not null default 1,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.questions to authenticated;
grant all on public.questions to service_role;
alter table public.questions enable row level security;

create or replace function public.can_teach_assignment(_assignment_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assignments a join public.classes c on c.id = a.class_id
    where a.id = _assignment_id and c.teacher_id = _user_id
  )
$$;

create or replace function public.can_study_assignment(_assignment_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assignments a join public.class_members m on m.class_id = a.class_id
    where a.id = _assignment_id and m.student_id = _user_id
  )
$$;

-- questions: teachers only via Data API; students read safe columns through the server
create policy "teacher manages questions" on public.questions for all to authenticated
  using (public.can_teach_assignment(assignment_id, auth.uid()))
  with check (public.can_teach_assignment(assignment_id, auth.uid()));

-- submissions
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'in_progress',
  awarded_marks numeric not null default 0,
  total_marks int not null default 0,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);
grant select, insert, update on public.submissions to authenticated;
grant all on public.submissions to service_role;
alter table public.submissions enable row level security;

create policy "student manages own submission" on public.submissions for all to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "teacher reads submissions" on public.submissions for select to authenticated
  using (public.can_teach_assignment(assignment_id, auth.uid()));
create policy "teacher updates submissions" on public.submissions for update to authenticated
  using (public.can_teach_assignment(assignment_id, auth.uid()))
  with check (public.can_teach_assignment(assignment_id, auth.uid()));

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  answer_text text not null default '',
  verdict text,
  awarded_marks numeric not null default 0,
  feedback text,
  attempts int not null default 0,
  resolved boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (submission_id, question_id)
);
grant select, insert, update on public.answers to authenticated;
grant all on public.answers to service_role;
alter table public.answers enable row level security;

create or replace function public.owns_submission(_submission_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.submissions where id = _submission_id and student_id = _user_id)
$$;

create or replace function public.teaches_submission(_submission_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.submissions s join public.assignments a on a.id = s.assignment_id
    join public.classes c on c.id = a.class_id
    where s.id = _submission_id and c.teacher_id = _user_id
  )
$$;

create policy "student manages own answers" on public.answers for all to authenticated
  using (public.owns_submission(submission_id, auth.uid()))
  with check (public.owns_submission(submission_id, auth.uid()));
create policy "teacher reads answers" on public.answers for select to authenticated
  using (public.teaches_submission(submission_id, auth.uid()));
create policy "teacher updates answers" on public.answers for update to authenticated
  using (public.teaches_submission(submission_id, auth.uid()))
  with check (public.teaches_submission(submission_id, auth.uid()));

create table public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.tutor_messages to authenticated;
grant all on public.tutor_messages to service_role;
alter table public.tutor_messages enable row level security;

create or replace function public.owns_answer(_answer_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.answers an join public.submissions s on s.id = an.submission_id
    where an.id = _answer_id and s.student_id = _user_id
  )
$$;

create or replace function public.teaches_answer(_answer_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.answers an join public.submissions s on s.id = an.submission_id
    join public.assignments a on a.id = s.assignment_id join public.classes c on c.id = a.class_id
    where an.id = _answer_id and c.teacher_id = _user_id
  )
$$;

create policy "student reads own tutor messages" on public.tutor_messages for select to authenticated
  using (public.owns_answer(answer_id, auth.uid()));
create policy "student adds tutor messages" on public.tutor_messages for insert to authenticated
  with check (public.owns_answer(answer_id, auth.uid()));
create policy "teacher reads tutor messages" on public.tutor_messages for select to authenticated
  using (public.teaches_answer(answer_id, auth.uid()));
