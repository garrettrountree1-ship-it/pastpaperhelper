create table public.question_exclusions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (question_id, student_id)
);

grant select on public.question_exclusions to authenticated;
grant all on public.question_exclusions to service_role;

alter table public.question_exclusions enable row level security;

create policy "student reads own exclusions"
  on public.question_exclusions for select to authenticated
  using (student_id = auth.uid());

create policy "teacher manages exclusions"
  on public.question_exclusions for all to authenticated
  using (exists (
    select 1 from public.questions q
    join public.assignments a on a.id = q.assignment_id
    join public.classes c on c.id = a.class_id
    where q.id = question_id and c.teacher_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.questions q
    join public.assignments a on a.id = q.assignment_id
    join public.classes c on c.id = a.class_id
    where q.id = question_id and c.teacher_id = auth.uid()
  ));