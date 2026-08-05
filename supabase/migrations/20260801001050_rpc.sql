-- ═══════════════════════════════════════════════════════════════════════════
--  1050 · Public RPCs (PostgREST `/rpc/*`)
-- ═══════════════════════════════════════════════════════════════════════════
--  Only four things live here, and each is here for the same reason: the
--  operation cannot be expressed safely as a table read or write.
--
--    get_quiz_paper       — must return questions WITHOUT the answer key.
--    start_quiz_attempt   — must enforce the attempt limit and set a
--                           server-side deadline the client cannot move.
--    submit_quiz_attempt  — must mark the paper. A client that could write its
--                           own score would not be an assessment system.
--    current_user_context — one round trip for the app bootstrap instead of six.
--
--  Everything else — assignments, grades, attendance — is plain table access
--  under RLS. Wrapping those in RPCs would only move the security boundary
--  somewhere harder to audit.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ App bootstrap ═════════════════════════════════════════════════════════

create or replace function public.current_user_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(u) - 'metadata',
    'roles', coalesce(
      (select jsonb_agg(r.slug order by r.rank)
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id
        where ur.user_id = v_uid
          and (ur.expires_at is null or ur.expires_at > now())),
      '[]'::jsonb
    ),
    'school', (
      select jsonb_build_object(
               'id', s.id, 'name', s.name, 'slug', s.slug, 'motto', s.motto,
               'logo_path', s.logo_path, 'timezone', s.timezone, 'locale', s.locale,
               'grading_scale', s.grading_scale
             )
        from public.schools s where s.id = u.school_id
    ),
    'student_id', (select st.id from public.students st where st.user_id = v_uid),
    'teacher_id', (select t.id  from public.teachers t  where t.user_id = v_uid),
    'parent_id',  (select p.id  from public.parents p   where p.user_id = v_uid),
    'children', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'student_id', st.id,
                'user_id', cu.id,
                'full_name', cu.full_name,
                'admission_number', st.admission_number,
                'class_id', st.current_class_id,
                'avatar_path', cu.avatar_path))
         from public.parent_students ps
         join public.parents pa on pa.id = ps.parent_id
         join public.students st on st.id = ps.student_id
         join public.users cu on cu.id = st.user_id
        where pa.user_id = v_uid),
      '[]'::jsonb
    ),
    'current_session', (
      select jsonb_build_object('id', a.id, 'name', a.name, 'term', a.term,
                                'starts_on', a.starts_on, 'ends_on', a.ends_on)
        from public.academic_sessions a
       where a.school_id = u.school_id and a.is_current
       limit 1
    ),
    'unread_notifications', (
      select count(*) from public.notifications n
       where n.user_id = v_uid and not n.is_read
    )
  )
  into v_result
  from public.users u
  where u.id = v_uid;

  return v_result;
end;
$$;

comment on function public.current_user_context() is
  'Single-round-trip bootstrap: profile, roles, school, role ids, children, '
  'current term and unread count.';

-- ═══ Notifications ═════════════════════════════════════════════════════════

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security invoker              -- RLS on public.notifications is the guard.
set search_path = ''
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.notifications
       set is_read = true, read_at = now()
     where user_id = (select auth.uid())
       and not is_read
    returning 1
  )
  select count(*) into v_count from updated;
  return v_count;
end;
$$;

-- ═══ Quizzes ═══════════════════════════════════════════════════════════════

--  The student's view of a paper: prompt, options, marks. No `correct_answers`
--  and no `explanation` — those columns never leave the database until the
--  attempt has been graded.
create or replace function public.get_quiz_paper(p_quiz_id uuid)
returns table (
  id            uuid,
  sort_order    smallint,
  question_type public.question_type,
  prompt        text,
  options       jsonb,
  points        numeric,
  media_path    text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quizzes%rowtype;
  v_student uuid := app.current_student_id();
  v_shuffle boolean;
begin
  select * into q from public.quizzes where quizzes.id = p_quiz_id;
  if not found then
    raise exception 'Quiz not found' using errcode = 'no_data_found';
  end if;

  -- Staff who own the paper get it in order; everyone else must be an enrolled
  -- student sitting a published, open paper.
  if app.teaches_class_subject(q.class_id, q.subject_id) or app.is_admin() then
    v_shuffle := false;
  else
    if v_student is null or not app.is_enrolled_in(q.class_id) then
      raise exception 'Not authorised to view this quiz'
        using errcode = 'insufficient_privilege';
    end if;
    if q.status <> 'published'
       or (q.opens_at is not null and now() < q.opens_at)
       or (q.closes_at is not null and now() > q.closes_at)
    then
      raise exception 'This quiz is not open' using errcode = 'check_violation';
    end if;
    v_shuffle := q.shuffle_questions;
  end if;

  return query
    select qq.id,
           qq.sort_order,
           qq.question_type,
           qq.prompt,
           case
             when q.shuffle_options and qq.options is not null and v_shuffle then
               (select jsonb_agg(o order by random())
                  from jsonb_array_elements(qq.options) o)
             else qq.options
           end as options,
           qq.points,
           qq.media_path
      from public.quiz_questions qq
     where qq.quiz_id = p_quiz_id
     order by case when v_shuffle then random() else null end,
              qq.sort_order;
end;
$$;

--  Opens an attempt. Enforces the attempt limit and stamps a deadline the
--  client cannot argue with.
create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns public.quiz_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  q         public.quizzes%rowtype;
  v_student uuid := app.current_student_id();
  v_taken   smallint;
  v_open    public.quiz_attempts;
  v_result  public.quiz_attempts;
begin
  if v_student is null then
    raise exception 'Only a student can sit a quiz' using errcode = 'insufficient_privilege';
  end if;

  select * into q from public.quizzes where quizzes.id = p_quiz_id;
  if not found then
    raise exception 'Quiz not found' using errcode = 'no_data_found';
  end if;

  if not app.is_enrolled_in(q.class_id) then
    raise exception 'You are not enrolled in this class' using errcode = 'insufficient_privilege';
  end if;

  if q.status <> 'published'
     or (q.opens_at is not null and now() < q.opens_at)
     or (q.closes_at is not null and now() > q.closes_at)
  then
    raise exception 'This quiz is not open' using errcode = 'check_violation';
  end if;

  -- Resume rather than start a second time.
  select * into v_open
    from public.quiz_attempts a
   where a.quiz_id = p_quiz_id
     and a.student_id = v_student
     and a.status = 'in_progress'
   order by a.attempt_number desc
   limit 1;

  if found then
    if v_open.expires_at is not null and now() > v_open.expires_at then
      update public.quiz_attempts
         set status = 'expired', submitted_at = coalesce(submitted_at, v_open.expires_at)
       where quiz_attempts.id = v_open.id;
    else
      return v_open;
    end if;
  end if;

  select coalesce(max(a.attempt_number), 0) into v_taken
    from public.quiz_attempts a
   where a.quiz_id = p_quiz_id and a.student_id = v_student;

  if v_taken >= q.max_attempts then
    raise exception 'You have used all % attempt(s) for this quiz', q.max_attempts
      using errcode = 'check_violation';
  end if;

  insert into public.quiz_attempts (
    school_id, quiz_id, student_id, attempt_number, status, started_at, expires_at, max_score
  )
  values (
    q.school_id, p_quiz_id, v_student, (v_taken + 1)::smallint, 'in_progress', now(),
    least(
      now() + make_interval(mins => q.duration_minutes),
      coalesce(q.closes_at, now() + make_interval(mins => q.duration_minutes))
    ),
    nullif(q.total_points, 0)
  )
  returning * into v_result;

  return v_result;
end;
$$;

--  Marks the paper. Objective questions are scored here; essays are left for a
--  teacher, and the attempt stays `submitted` until they are done.
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

        when 'multiple_select' then
          v_correct := (
            select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(v_given) x
          ) = (
            select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(qq.correct_answers) x
          );

        when 'short_answer' then
          -- Accepts any of the model answers, case- and whitespace-insensitive.
          v_correct := exists (
            select 1
              from jsonb_array_elements_text(coalesce(qq.correct_answers, '[]'::jsonb)) ok
             where lower(btrim(ok)) = lower(btrim(coalesce(v_given ->> 0, '')))
          );

        when 'essay' then
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

  if not v_needs_human then
    perform app.notify_users(
      a.school_id,
      array[(select s.user_id from public.students s where s.id = v_student)],
      'quiz_graded',
      coalesce(q.title, 'Your quiz') || ' — result available',
      'Score: ' || v_score || ' / ' || nullif(v_max, 0),
      '/student/quizzes/' || a.quiz_id || '/results',
      'quiz_attempts', p_attempt_id, null
    );
  end if;

  return v_result;
end;
$$;

-- ═══ Grants ════════════════════════════════════════════════════════════════
--  Postgres grants EXECUTE to PUBLIC on new functions by default, which would
--  expose every one of these to the `anon` role through PostgREST. Revoke
--  first, then grant deliberately.

revoke execute on function public.current_user_context()                    from public, anon;
revoke execute on function public.mark_all_notifications_read()             from public, anon;
revoke execute on function public.get_quiz_paper(uuid)                      from public, anon;
revoke execute on function public.start_quiz_attempt(uuid)                  from public, anon;
revoke execute on function public.submit_quiz_attempt(uuid, jsonb)          from public, anon;

grant execute on function public.current_user_context()           to authenticated, service_role;
grant execute on function public.mark_all_notifications_read()    to authenticated, service_role;
grant execute on function public.get_quiz_paper(uuid)             to authenticated, service_role;
grant execute on function public.start_quiz_attempt(uuid)         to authenticated, service_role;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated, service_role;
