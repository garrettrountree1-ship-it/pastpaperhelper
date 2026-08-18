alter table public.classes
  add column if not exists tutor_language text not null default 'English',
  add column if not exists tutor_level text not null default 'medium',
  add column if not exists protect_questions boolean not null default false,
  add column if not exists keyword_translation boolean not null default false,
  add column if not exists student_can_change_level boolean not null default false;

alter table public.questions
  add column if not exists keyword_glossary jsonb not null default '[]'::jsonb;

create table if not exists public.class_student_settings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  tutor_language text,
  tutor_level text,
  student_can_change_level boolean,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_student_settings TO authenticated;
GRANT ALL ON public.class_student_settings TO service_role;

alter table public.class_student_settings enable row level security;

create policy "teacher manages class student settings"
on public.class_student_settings for all to authenticated
using (public.is_class_teacher(class_id, auth.uid()))
with check (public.is_class_teacher(class_id, auth.uid()));

create policy "student reads own class settings"
on public.class_student_settings for select to authenticated
using (student_id = auth.uid());