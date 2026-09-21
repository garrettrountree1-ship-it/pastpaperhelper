-- Existing email-verified students can receive a teacher-managed username without
-- changing their normal email login. A password is only stored after the teacher
-- explicitly resets it because Supabase passwords are one-way hashed.
alter table public.managed_student_credentials
  alter column temporary_password drop not null;
