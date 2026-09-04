ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejection_note text;

CREATE OR REPLACE FUNCTION public.guard_answer_grading()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    new.rejected_at := null;
    new.rejected_by := null;
    new.rejection_note := null;
  else
    new.verdict := old.verdict;
    new.awarded_marks := old.awarded_marks;
    new.feedback := old.feedback;
    new.resolved := old.resolved;
    new.mark_breakdown := old.mark_breakdown;
    new.attempt_history := old.attempt_history;
    new.attempts := old.attempts;
    new.rejected_at := old.rejected_at;
    new.rejected_by := old.rejected_by;
    new.rejection_note := old.rejection_note;
  end if;

  return new;
end;
$function$;