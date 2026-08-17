-- 1) Guard grading columns on answers against student writes
create or replace function public.guard_answer_grading()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_student boolean;
begin
  -- service role / internal grading engine bypasses RLS and this guard
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- teachers of this submission may edit grading fields
  if public.teaches_submission(new.submission_id, auth.uid()) then
    return new;
  end if;

  select exists (
    select 1 from public.submissions s
    where s.id = new.submission_id and s.student_id = auth.uid()
  ) into is_student;

  if not is_student then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.verdict := null;
    new.awarded_marks := 0;
    new.feedback := null;
    new.resolved := false;
    new.mark_breakdown := '[]'::jsonb;
    new.attempt_history := '[]'::jsonb;
    new.attempts := 0;
  else
    new.verdict := old.verdict;
    new.awarded_marks := old.awarded_marks;
    new.feedback := old.feedback;
    new.resolved := old.resolved;
    new.mark_breakdown := old.mark_breakdown;
    new.attempt_history := old.attempt_history;
    new.attempts := old.attempts;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_answer_grading() from public, anon, authenticated;

drop trigger if exists guard_answer_grading_trg on public.answers;
create trigger guard_answer_grading_trg
before insert or update on public.answers
for each row execute function public.guard_answer_grading();

-- 2) Guard grading columns on submissions against student writes
create or replace function public.guard_submission_grading()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if public.can_teach_assignment(new.assignment_id, auth.uid()) then
    return new;
  end if;

  if new.student_id is distinct from auth.uid() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.awarded_marks := 0;
    new.total_marks := 0;
    new.ai_flag_count := 0;
    new.locked_at := null;
    new.locked_reason := null;
    new.penalty_percent := 0;
  else
    new.awarded_marks := old.awarded_marks;
    new.total_marks := old.total_marks;
    new.ai_flag_count := old.ai_flag_count;
    new.locked_at := old.locked_at;
    new.locked_reason := old.locked_reason;
    new.penalty_percent := old.penalty_percent;
    -- students may only move status forward to submitted, never back to graded/unlocked states
    if new.status not in ('in_progress', 'submitted') then
      new.status := old.status;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_submission_grading() from public, anon, authenticated;

drop trigger if exists guard_submission_grading_trg on public.submissions;
create trigger guard_submission_grading_trg
before insert or update on public.submissions
for each row execute function public.guard_submission_grading();

-- 3) Internal signup handler must not be directly callable by API roles
revoke all on function public.handle_new_user() from public, anon, authenticated;