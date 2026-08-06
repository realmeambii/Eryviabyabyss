-- ═══════════════════════════════════════════════════════════════════════════
--  submit_quiz_attempt() could never close an attempt
-- ═══════════════════════════════════════════════════════════════════════════
--  Every call failed with:
--
--    ERROR: column "status" is of type public.attempt_status
--           but expression is of type text
--
--  The CASE that picks the closing status has three bare string literals and no
--  ELSE of a known type, so PostgreSQL resolves the whole expression to `text`
--  rather than leaving it `unknown` for the assignment to coerce. `status` is
--  an enum, and text does not implicitly cast to it.
--
--  This is not new. The expression is verbatim from the Phase 1 RPC in
--  a777636 — it has been there since the schema was written, and was only
--  reached now because nothing had ever called the function: the student
--  quiz-sitting UI did not exist, and the seed inserts `quiz_attempts` rows
--  directly rather than going through the RPC.
--
--  So no pupil ever lost a paper to it. Every pupil would have, on the first
--  test ever sat, with a message about a text column that says nothing about
--  what went wrong.
--
--  The fix is the explicit cast. `graded_at` beside it is fine — its arms are
--  `null` and `now()`, so the CASE already resolves to timestamptz.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.submit_quiz_attempt(p_attempt_id uuid, p_responses jsonb)
returns public.quiz_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  a             public.quiz_attempts%rowtype;
  q             public.quizzes%rowtype;
  qq            record;
  v_student     uuid := app.current_student_id();
  v_given       jsonb;
  v_score       numeric := 0;
  v_max         numeric := 0;
  v_needs_human boolean := false;
  v_correct     boolean;
  v_result      public.quiz_attempts;
begin
  if jsonb_typeof(coalesce(p_responses, 'null'::jsonb)) <> 'object' then
    raise exception 'responses must be a JSON object keyed by question id'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into a from public.quiz_attempts where quiz_attempts.id = p_attempt_id;
  if not found then
    raise exception 'Attempt not found' using errcode = 'no_data_found';
  end if;
  if a.student_id is distinct from v_student then
    raise exception 'This attempt does not belong to you' using errcode = 'insufficient_privilege';
  end if;
  if a.status <> 'in_progress' then
    raise exception 'This attempt has already been submitted' using errcode = 'check_violation';
  end if;

  select * into q from public.quizzes where quizzes.id = a.quiz_id;

  for qq in
    select * from public.quiz_questions where quiz_id = a.quiz_id order by sort_order
  loop
    v_max := v_max + qq.points;
    v_given := p_responses -> qq.id::text;
    v_correct := false;

    if v_given is not null and jsonb_typeof(v_given) = 'array' then
      case qq.question_type
        when 'multiple_choice', 'true_false' then
          v_correct := jsonb_array_length(v_given) = 1
                   and (v_given ->> 0) = (qq.correct_answers ->> 0);

        when 'multiple_select', 'matching' then
          v_correct := (
            select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(v_given) x
          ) = (
            select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(qq.correct_answers) x
          );

        when 'short_answer', 'fill_blank' then
          v_correct := exists (
            select 1
              from jsonb_array_elements_text(coalesce(qq.correct_answers, '[]'::jsonb)) ok
             where lower(btrim(ok)) = lower(btrim(coalesce(v_given ->> 0, '')))
          );

        when 'essay' then
          v_needs_human := true;

        else
          -- A question type this function has not been taught goes to a human
          -- rather than raising. See 20260806000100.
          v_needs_human := true;
      end case;
    elsif qq.question_type = 'essay' then
      v_needs_human := true;
    end if;

    if v_correct then
      v_score := v_score + qq.points;
    end if;
  end loop;

  update public.quiz_attempts
     set responses    = p_responses,
         score        = v_score,
         max_score    = nullif(v_max, 0),
         -- The cast is the fix. Without it the CASE resolves to `text` and the
         -- assignment to an enum column is rejected.
         status       = (case
                          when a.expires_at is not null and now() > a.expires_at then 'expired'
                          when v_needs_human then 'submitted'
                          else 'graded'
                        end)::public.attempt_status,
         submitted_at = now(),
         graded_at    = case when v_needs_human then null else now() end,
         time_spent_seconds = greatest(0, extract(epoch from (now() - a.started_at))::integer)
   where quiz_attempts.id = p_attempt_id
  returning * into v_result;

  return v_result;
end;
$$;

comment on function public.submit_quiz_attempt(uuid, jsonb) is
  'Marks a paper server-side and closes the attempt. Objective types are graded '
  'here; essays — and any question type this function does not recognise — are '
  'left as `submitted` for a teacher to mark.';

revoke execute on function public.submit_quiz_attempt(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated, service_role;
