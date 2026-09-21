create table if not exists public.managed_student_credentials (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  username text not null unique,
  temporary_password text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, student_id)
);

alter table public.managed_student_credentials enable row level security;

create policy "Class teachers manage backup student logins"
on public.managed_student_credentials
for all
to authenticated
using (public.is_class_teacher(class_id, auth.uid()))
with check (public.is_class_teacher(class_id, auth.uid()));

comment on table public.managed_student_credentials is
  'Teacher-created backup usernames and recoverable temporary passwords. Teacher-only by RLS.';
