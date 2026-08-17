create table public.class_announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null,
  created_at timestamp with time zone not null default now()
);
grant select, insert, update, delete on public.class_announcements to authenticated;
grant all on public.class_announcements to service_role;
alter table public.class_announcements enable row level security;
create policy "teacher manages announcements" on public.class_announcements for all to authenticated
  using (public.is_class_teacher(class_id, auth.uid())) with check (public.is_class_teacher(class_id, auth.uid()) and author_id = auth.uid());
create policy "students read announcements" on public.class_announcements for select to authenticated
  using (public.is_class_member(class_id, auth.uid()));

create table public.class_messages (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null default 'student',
  assignment_id uuid references public.assignments(id) on delete set null,
  question_id uuid references public.questions(id) on delete set null,
  topic text not null default '',
  body text not null,
  created_at timestamp with time zone not null default now()
);
create index class_messages_thread_idx on public.class_messages (class_id, student_id, created_at);
grant select, insert on public.class_messages to authenticated;
grant all on public.class_messages to service_role;
alter table public.class_messages enable row level security;
create policy "student reads own messages" on public.class_messages for select to authenticated
  using (student_id = auth.uid());
create policy "student sends own messages" on public.class_messages for insert to authenticated
  with check (student_id = auth.uid() and sender_id = auth.uid() and sender_role = 'student' and public.is_class_member(class_id, auth.uid()));
create policy "teacher reads class messages" on public.class_messages for select to authenticated
  using (public.is_class_teacher(class_id, auth.uid()));
create policy "teacher sends class messages" on public.class_messages for insert to authenticated
  with check (public.is_class_teacher(class_id, auth.uid()) and sender_id = auth.uid() and sender_role = 'teacher');