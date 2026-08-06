-- ═══════════════════════════════════════════════════════════════════════════
--  Teach submit_quiz_attempt() the two new question types
-- ═══════════════════════════════════════════════════════════════════════════
--  `20260805000400` added `fill_blank` and `matching` to `question_type`, but
--  the marker in `submit_quiz_attempt()` is a plpgsql CASE *statement* over
--  that enum with no ELSE branch. plpgsql raises `case_not_found` (SQLSTATE
--  20000) when nothing matches — so a quiz containing either new type would
--  have thrown the moment a pupil pressed submit, losing the whole paper.
--
--  Verified: `case v when … end case` with an unmatched value raises
--  "case not found". Nothing had created a question of either type yet, so no
--  attempt was ever lost.
--
--  The ELSE branch is the part that matters beyond today. An unknown question
--  type now falls to a human marker instead of destroying the submission —
--  the next person to append to this enum gets a paper in the review queue,
--  not a support ticket from a pupil who lost forty minutes of work.
--
--  Grading rules for the two new types:
--
--    fill_blank  Graded exactly like short_answer: `correct_answers` is the
--                list of accepted strings and any one of them earns the mark,
--                compared case- and whitespace-insensitively. The difference
--                from short_answer is presentation — the blank sits inline in
--                the prompt — not marking. A question with several blanks is
--                several questions.
--
--    matching    `options` holds the pairs as [{id, label, match}]; the pupil
--                is shown the labels with the matches shuffled.
--                `correct_answers` is ["<id>:<match>", …] and the response has
--                the same shape, so the mark is set equality — the identical
--                comparison multiple_select already uses. All pairs or nothing;
--                partial credit on a matching question needs a rubric, not a
--                marker.
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

  -- Past the deadline the paper is still accepted, but it is recorded as
  -- expired rather than silently backdated.
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
          -- Set equality: order of selection, and order of the pairs, is not
          -- part of the answer.
          v_correct := (
            select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(v_given) x
          ) = (
            select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(qq.correct_answers) x
          );

        when 'short_answer', 'fill_blank' then
          -- Accepts any of the model answers, case- and whitespace-insensitive.
          v_correct := exists (
            select 1
              from jsonb_array_elements_text(coalesce(qq.correct_answers, '[]'::jsonb)) ok
             where lower(btrim(ok)) = lower(btrim(coalesce(v_given ->> 0, '')))
          );

        when 'essay' then
          v_needs_human := true;

        else
          -- A question type this function has not been taught. Send it to a
          -- human rather than raising: the pupil's paper is worth more than
          -- the tidiness of failing fast, and the alternative is losing it.
          v_needs_human := true;
      end case;
    elsif qq.question_type in ('essay', 'fill_blank') then
      -- Unanswered essays still need a marker to record a zero deliberately.
      -- An unanswered fill_blank is simply wrong, but it is cheap to let the
      -- teacher confirm that when the paper is already in front of them.
      v_needs_human := v_needs_human or qq.question_type = 'essay';
    end if;

    if v_correct then
      v_score := v_score + qq.points;
    end if;
  end loop;

  update public.quiz_attempts
     set responses    = p_responses,
         score        = v_score,
         max_score    = nullif(v_max, 0),
         status       = case
                          when a.expires_at is not null and now() > a.expires_at then 'expired'
                          when v_needs_human then 'submitted'
                          else 'graded'
                        end,
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
