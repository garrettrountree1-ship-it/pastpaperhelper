alter table public.questions
  add column if not exists photo_mode text not null default 'auto'
  check (photo_mode in ('auto','on','off'));

alter table public.assignments
  add column if not exists photo_mode text not null default 'auto'
  check (photo_mode in ('auto','on','off'));

alter table public.student_assignment_settings
  add column if not exists photo_mode text
  check (photo_mode is null or photo_mode in ('auto','on','off'));