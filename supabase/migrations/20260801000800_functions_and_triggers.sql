-- ═══════════════════════════════════════════════════════════════════════════
--  0800 · Business-rule functions and triggers
-- ═══════════════════════════════════════════════════════════════════════════
--  Rules that must hold no matter which client wrote the row live here, not in
--  the React app: lateness, grade banding, gradebook sync, notification
--  fan-out, the audit trail.
--
--  Every function is SECURITY DEFINER with `search_path = ''` and fully
--  qualified identifiers.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ Profile plumbing ══════════════════════════════════════════════════════

create or replace function app.sync_user_full_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.full_name := btrim(
    regexp_replace(
      concat_ws(' ', btrim(new.first_name), btrim(new.middle_name), btrim(new.last_name)),
      '\s+', ' ', 'g'
    )
  );
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

create trigger sync_user_full_name
  before insert or update of first_name, middle_name, last_name, email
  on public.users
  for each row execute function app.sync_user_full_name();

-- ── Identifier generation ──────────────────────────────────────────────────
--  Derived from the user's own uuid rather than a counter, so two concurrent
--  sign-ups can never collide on the unique constraint.
create or replace function app.derive_identifier(p_prefix text, p_uuid uuid)
returns text
language sql
stable
set search_path = ''
as $$
  -- Hash the whole uuid rather than slicing its prefix. A prefix slice assumes
  -- the randomness lives in the leading bytes, which is false for time-ordered
  -- uuids (v1, v7 — where the first bytes are a timestamp) and for any
  -- structured id, so it collides. md5 distributes regardless of how the uuid
  -- was generated. 8 hex chars, and the unique constraint catches the rest.
  select p_prefix || '/' || to_char(now(), 'YYYY') || '/' ||
         upper(substr(md5(p_uuid::text), 1, 8));
$$;

-- ── auth.users → public.users ──────────────────────────────────────────────
--  SECURITY NOTE: `raw_user_meta_data` is attacker-controlled — it is whatever
--  the browser passed to `supabase.auth.signUp({ options: { data } })`. Only
--  `raw_app_meta_data`, which requires the service-role key, is trusted. So a
--  self-service sign-up can only ever land on `student` or `parent`; teacher
--  and administrator have to be provisioned server-side.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_app_meta   jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_school_id  uuid;
  v_role_slug  text;
  v_role_id    uuid;
  v_first_name text;
  v_last_name  text;
  v_active_schools int;
begin
  -- ── School ──────────────────────────────────────────────────────────────
  begin
    v_school_id := nullif(coalesce(v_app_meta ->> 'school_id', v_user_meta ->> 'school_id'), '')::uuid;
  exception when others then
    v_school_id := null;
  end;

  if v_school_id is null then
    select count(*) into v_active_schools from public.schools where is_active;
    if v_active_schools = 1 then
      select id into v_school_id from public.schools where is_active limit 1;
    end if;
    -- More than one school and no hint: leave school_id null. RLS then denies
    -- everything until an administrator places the account.
  end if;

  -- ── Role ────────────────────────────────────────────────────────────────
  v_role_slug := nullif(v_app_meta ->> 'role', '');       -- trusted (server-set)
  if v_role_slug is null then
    v_role_slug := nullif(v_user_meta ->> 'role', '');    -- untrusted (client-set)
    if v_role_slug is null or v_role_slug not in ('student', 'parent') then
      v_role_slug := 'student';
    end if;
  end if;

  select id into v_role_id from public.roles where slug = v_role_slug;
  if v_role_id is null then
    select id into v_role_id from public.roles where slug = 'student';
    v_role_slug := 'student';
  end if;

  -- ── Names ───────────────────────────────────────────────────────────────
  v_first_name := nullif(btrim(coalesce(v_user_meta ->> 'first_name', '')), '');
  v_last_name  := nullif(btrim(coalesce(v_user_meta ->> 'last_name', '')), '');
  if v_first_name is null then
    v_first_name := split_part(new.email, '@', 1);
  end if;
  if v_last_name is null then
    v_last_name := 'Unnamed';
  end if;

  insert into public.users (id, school_id, email, first_name, last_name, phone, status)
  values (
    new.id,
    v_school_id,
    lower(new.email),
    v_first_name,
    v_last_name,
    nullif(btrim(coalesce(v_user_meta ->> 'phone', '')), ''),
    case when new.email_confirmed_at is null then 'invited' else 'active' end::public.user_status
  )
  on conflict (id) do nothing;

  -- ── Role grant + role extension row ─────────────────────────────────────
  if v_school_id is not null then
    insert into public.user_roles (user_id, role_id, school_id)
    values (new.id, v_role_id, v_school_id)
    on conflict (user_id, role_id, school_id) do nothing;

    if v_role_slug = 'student' then
      insert into public.students (user_id, school_id, admission_number)
      values (new.id, v_school_id, app.derive_identifier('ADM', new.id))
      on conflict (user_id) do nothing;

    elsif v_role_slug = 'parent' then
      insert into public.parents (user_id, school_id)
      values (new.id, v_school_id)
      on conflict (user_id) do nothing;

    elsif v_role_slug = 'teacher' then
      insert into public.teachers (user_id, school_id, staff_number)
      values (new.id, v_school_id, app.derive_identifier('STF', new.id))
      on conflict (user_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT on auth.users. Creates the profile, grants a role and creates '
  'the matching role-extension row. Self-signup can only reach student/parent.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the profile in step when Supabase Auth confirms an address or the user
-- changes their email through the auth API.
create or replace function public.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users u
     set email  = lower(new.email),
         status = case
                    when u.status = 'invited' and new.email_confirmed_at is not null then 'active'
                    else u.status
                  end
   where u.id = new.id
     and (u.email is distinct from lower(new.email)
          or (u.status = 'invited' and new.email_confirmed_at is not null));
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function public.handle_user_email_confirmed();

-- ═══ Enrolment ═════════════════════════════════════════════════════════════

--  `students.current_class_id` is a cache of "the class for the current term".
--  Recomputed whenever an active enrolment lands on the current session.
create or replace function app.sync_current_class()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
     and exists (
       select 1 from public.academic_sessions s
        where s.id = new.academic_session_id and s.is_current
     )
  then
    update public.students
       set current_class_id = new.class_id
     where id = new.student_id
       and current_class_id is distinct from new.class_id;
  end if;
  return new;
end;
$$;

create trigger sync_current_class
  after insert or update of class_id, status, academic_session_id on public.enrollments
  for each row execute function app.sync_current_class();

-- ═══ Submissions ═══════════════════════════════════════════════════════════

create or replace function app.enforce_submission_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due     timestamptz;
  v_closes  timestamptz;
  v_allow   boolean;
  v_status  public.publication_status;
  v_max     numeric;
begin
  select a.due_at, a.closes_at, a.allow_late, a.status, a.max_score
    into v_due, v_closes, v_allow, v_status, v_max
    from public.assignments a
   where a.id = new.assignment_id;

  if v_due is null then
    raise exception 'Assignment % does not exist', new.assignment_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Lateness is decided by the database clock, never by the client.
  if new.submitted_at is not null then
    new.is_late := new.submitted_at > v_due;
  elsif new.status <> 'draft' then
    new.submitted_at := now();
    new.is_late := now() > v_due;
  end if;

  -- A student moving a submission out of draft must respect the window. A
  -- teacher grading it later must not be blocked by the same rule, so this
  -- only fires on the student-owned statuses.
  if new.status in ('submitted', 'resubmitted', 'late') then
    if v_status <> 'published' then
      raise exception 'Assignment is not open for submissions'
        using errcode = 'check_violation';
    end if;
    if v_closes is not null and now() > v_closes then
      raise exception 'The submission window for this assignment has closed'
        using errcode = 'check_violation';
    end if;
    if new.is_late then
      if not v_allow then
        raise exception 'This assignment does not accept late submissions'
          using errcode = 'check_violation';
      end if;
      new.status := 'late';
    end if;
  end if;

  if new.score is not null and new.score > v_max then
    raise exception 'Score % exceeds the assignment maximum of %', new.score, v_max
      using errcode = 'check_violation';
  end if;

  if new.status = 'graded' and new.graded_at is null then
    new.graded_at := now();
  end if;

  return new;
end;
$$;

create trigger enforce_submission_rules
  before insert or update on public.assignment_submissions
  for each row execute function app.enforce_submission_rules();

-- ═══ Gradebook ═════════════════════════════════════════════════════════════

--  Band the percentage against the school's own scale and freeze the result on
--  the row, so re-tuning the scale next year does not silently rewrite last
--  year's report cards.
create or replace function app.apply_grade_band()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- `percentage` is GENERATED STORED and is therefore not yet populated in a
  -- BEFORE trigger — compute it here rather than reading NEW.percentage.
  v_pct  numeric := round((new.score / nullif(new.max_score, 0)) * 100, 2);
  v_band jsonb;
begin
  select band
    into v_band
    from public.schools s
    cross join lateral jsonb_array_elements(s.grading_scale) as band
   where s.id = new.school_id
     and v_pct >= (band ->> 'min')::numeric
     and v_pct <= (band ->> 'max')::numeric
   order by (band ->> 'min')::numeric desc
   limit 1;

  if v_band is not null then
    new.letter_grade := v_band ->> 'grade';
    if new.remark is null then
      new.remark := v_band ->> 'remark';
    end if;
  end if;

  return new;
end;
$$;

create trigger apply_grade_band
  before insert or update of score, max_score, school_id on public.grades
  for each row execute function app.apply_grade_band();

--  A graded submission becomes a gradebook row. Idempotent: re-grading updates
--  the same row via the partial unique index on (student, source_type, source).
create or replace function app.sync_grade_from_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.assignments%rowtype;
begin
  if new.status <> 'graded' or new.score is null then
    return new;
  end if;

  select * into a from public.assignments where id = new.assignment_id;
  if not found then
    return new;
  end if;

  insert into public.grades (
    school_id, student_id, subject_id, class_id, academic_session_id,
    assessment_type, source_type, source_id, title,
    score, max_score, weight, recorded_by, recorded_at, is_published
  )
  values (
    new.school_id, new.student_id, a.subject_id, a.class_id, a.academic_session_id,
    a.assessment_type, 'assignment', new.id, a.title,
    new.score, a.max_score, a.weight, new.graded_by, coalesce(new.graded_at, now()), true
  )
  on conflict (student_id, source_type, source_id) where source_id is not null
  do update set
    score        = excluded.score,
    max_score    = excluded.max_score,
    title        = excluded.title,
    recorded_by  = excluded.recorded_by,
    recorded_at  = excluded.recorded_at,
    is_published = true,
    updated_at   = now();

  return new;
end;
$$;

create trigger sync_grade_from_submission
  after insert or update of status, score on public.assignment_submissions
  for each row execute function app.sync_grade_from_submission();

create or replace function app.sync_grade_from_quiz_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quizzes%rowtype;
begin
  if new.status <> 'graded' or new.score is null or new.max_score is null then
    return new;
  end if;

  select * into q from public.quizzes where id = new.quiz_id;
  if not found then
    return new;
  end if;

  insert into public.grades (
    school_id, student_id, subject_id, class_id, academic_session_id,
    assessment_type, source_type, source_id, title,
    score, max_score, weight, recorded_at, is_published
  )
  values (
    new.school_id, new.student_id, q.subject_id, q.class_id, q.academic_session_id,
    q.assessment_type, 'quiz', new.id, q.title,
    new.score, new.max_score, q.weight, coalesce(new.graded_at, now()), true
  )
  on conflict (student_id, source_type, source_id) where source_id is not null
  do update set
    score        = excluded.score,
    max_score    = excluded.max_score,
    recorded_at  = excluded.recorded_at,
    is_published = true,
    updated_at   = now();

  return new;
end;
$$;

create trigger sync_grade_from_quiz_attempt
  after insert or update of status, score on public.quiz_attempts
  for each row execute function app.sync_grade_from_quiz_attempt();

-- ═══ Quizzes ═══════════════════════════════════════════════════════════════

--  `quizzes.total_points` is a cache of sum(quiz_questions.points).
create or replace function app.recalc_quiz_total_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz_id uuid;
begin
  -- NEW is unassigned on DELETE and OLD is unassigned on INSERT, so branch
  -- rather than coalescing the two.
  if tg_op = 'DELETE' then
    v_quiz_id := old.quiz_id;
  else
    v_quiz_id := new.quiz_id;
  end if;

  update public.quizzes q
     set total_points = coalesce(
           (select sum(points) from public.quiz_questions where quiz_id = v_quiz_id), 0
         )
   where q.id = v_quiz_id;

  return null;  -- AFTER trigger: return value is ignored.
end;
$$;

create trigger recalc_quiz_total_points
  after insert or update of points or delete on public.quiz_questions
  for each row execute function app.recalc_quiz_total_points();

-- ═══ Notifications ═════════════════════════════════════════════════════════

create or replace function app.notify_users(
  p_school_id  uuid,
  p_user_ids   uuid[],
  p_type       public.notification_type,
  p_title      text,
  p_body       text,
  p_action_url text default null,
  p_entity_type text default null,
  p_entity_id  uuid default null,
  p_actor_id   uuid default null
)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (
    school_id, user_id, type, title, body, action_url, entity_type, entity_id, actor_id
  )
  select p_school_id, u, p_type, p_title, p_body, p_action_url, p_entity_type, p_entity_id, p_actor_id
    from unnest(p_user_ids) as u
   where u is not null;
  select coalesce(array_length(p_user_ids, 1), 0);
$$;

comment on function app.notify_users is
  'Fan-out helper. SECURITY DEFINER because a teacher publishing an assignment '
  'legitimately writes notification rows owned by students.';

--  Publishing an assignment or a quiz notifies the class.
create or replace function app.notify_class_on_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients uuid[];
  v_subject    text;
  v_type       public.notification_type;
  v_url        text;
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published') then
    return new;
  end if;

  select array_agg(s.user_id)
    into v_recipients
    from public.enrollments e
    join public.students s on s.id = e.student_id
   where e.class_id = new.class_id
     and e.academic_session_id = new.academic_session_id
     and e.status = 'active';

  if v_recipients is null then
    return new;
  end if;

  select sub.name into v_subject from public.subjects sub where sub.id = new.subject_id;

  if tg_table_name = 'assignments' then
    v_type := 'assignment_published';
    v_url  := '/student/assignments/' || new.id;
  else
    v_type := 'quiz_published';
    v_url  := '/student/quizzes/' || new.id;
  end if;

  perform app.notify_users(
    new.school_id, v_recipients, v_type,
    coalesce(v_subject, 'New') || ' · ' || new.title,
    case when tg_table_name = 'assignments'
         then 'A new assignment has been published.'
         else 'A new test has been published.' end,
    v_url, tg_table_name, new.id, null
  );

  return new;
end;
$$;

create trigger notify_class_on_assignment_publish
  after insert or update of status on public.assignments
  for each row execute function app.notify_class_on_publish();

create trigger notify_class_on_quiz_publish
  after insert or update of status on public.quizzes
  for each row execute function app.notify_class_on_publish();

--  A graded submission notifies the student and their primary contact.
create or replace function app.notify_on_submission_graded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_user uuid;
  v_parents      uuid[];
  v_title        text;
begin
  if new.status <> 'graded' or (tg_op = 'UPDATE' and old.status = 'graded') then
    return new;
  end if;

  select s.user_id into v_student_user from public.students s where s.id = new.student_id;
  select a.title  into v_title        from public.assignments a where a.id = new.assignment_id;

  perform app.notify_users(
    new.school_id, array[v_student_user], 'submission_graded',
    coalesce(v_title, 'Your submission') || ' has been graded',
    'Score: ' || new.score,
    '/student/assignments/' || new.assignment_id,
    'assignment_submissions', new.id, null
  );

  select array_agg(p.user_id)
    into v_parents
    from public.parent_students ps
    join public.parents p on p.id = ps.parent_id
   where ps.student_id = new.student_id
     and ps.is_primary_contact;

  if v_parents is not null then
    perform app.notify_users(
      new.school_id, v_parents, 'grade_posted',
      'A new result has been published',
      coalesce(v_title, 'An assessment') || ' has been graded.',
      '/parent/grades', 'assignment_submissions', new.id, null
    );
  end if;

  return new;
end;
$$;

create trigger notify_on_submission_graded
  after insert or update of status on public.assignment_submissions
  for each row execute function app.notify_on_submission_graded();

--  Publishing an announcement notifies its audience.
create or replace function app.notify_on_announcement_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipients uuid[];
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status = 'published') then
    return new;
  end if;

  case new.audience
    when 'school' then
      select array_agg(u.id) into v_recipients
        from public.users u
       where u.school_id = new.school_id and u.status = 'active';
    when 'class' then
      select array_agg(s.user_id) into v_recipients
        from public.enrollments e
        join public.students s on s.id = e.student_id
       where e.class_id = new.class_id and e.status = 'active';
    when 'role' then
      select array_agg(ur.user_id) into v_recipients
        from public.user_roles ur
       where ur.role_id = new.role_id and ur.school_id = new.school_id;
    when 'individual' then
      v_recipients := array[new.recipient_id];
  end case;

  if v_recipients is not null then
    perform app.notify_users(
      new.school_id, v_recipients, 'announcement',
      new.title, left(new.body, 280),
      '/announcements/' || new.id, 'announcements', new.id, new.author_id
    );
  end if;

  return new;
end;
$$;

create trigger notify_on_announcement_published
  after insert or update of status on public.announcements
  for each row execute function app.notify_on_announcement_published();

--  Keep read_at honest.
create or replace function app.stamp_notification_read()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_read and new.read_at is null then
    new.read_at := now();
  elsif not new.is_read then
    new.read_at := null;
  end if;
  return new;
end;
$$;

create trigger stamp_notification_read
  before insert or update of is_read on public.notifications
  for each row execute function app.stamp_notification_read();

-- ═══ Audit trail ═══════════════════════════════════════════════════════════

create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before  jsonb;
  v_after   jsonb;
  v_changed text[];
  v_action  public.audit_action;
  v_school  uuid;
  v_actor   uuid;
  -- Columns that must never be copied into the trail.
  v_redact  text[] := array['medical_notes', 'metadata', 'responses', 'correct_answers'];
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
    v_after  := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
  else
    v_action := 'delete';
    v_before := to_jsonb(old);
  end if;

  select coalesce(array_agg(t.k order by t.k), '{}'::text[])
    into v_changed
    from jsonb_each(coalesce(v_after, '{}'::jsonb)) as t(k, v)
   where t.k <> 'updated_at'
     and (v_before is null or (v_before -> t.k) is distinct from t.v);

  -- An UPDATE that only bumped updated_at is noise.
  if tg_op = 'UPDATE' and cardinality(v_changed) = 0 then
    return null;
  end if;

  v_before := v_before - v_redact;
  v_after  := v_after  - v_redact;

  v_school := nullif(coalesce(v_after ->> 'school_id', v_before ->> 'school_id'), '')::uuid;

  v_actor := auth.uid();
  if v_actor is not null and not exists (select 1 from public.users where id = v_actor) then
    v_actor := null;
  end if;

  insert into public.audit_logs (
    school_id, actor_id, action, entity_type, entity_id,
    before, after, changed_columns
  )
  values (
    v_school, v_actor, v_action, tg_table_name,
    nullif(coalesce(v_after ->> 'id', v_before ->> 'id'), '')::uuid,
    v_before, v_after, v_changed
  );

  return null;  -- AFTER trigger: return value is ignored.
end;
$$;

comment on function app.audit_row() is
  'Generic AFTER trigger writing to public.audit_logs. Attached to the tables '
  'where "who changed this, and when" is a compliance question.';

create trigger audit_users
  after insert or update or delete on public.users
  for each row execute function app.audit_row();

create trigger audit_user_roles
  after insert or update or delete on public.user_roles
  for each row execute function app.audit_row();

create trigger audit_enrollments
  after insert or update or delete on public.enrollments
  for each row execute function app.audit_row();

create trigger audit_grades
  after insert or update or delete on public.grades
  for each row execute function app.audit_row();

create trigger audit_assignment_submissions
  after insert or update or delete on public.assignment_submissions
  for each row execute function app.audit_row();

create trigger audit_teacher_assignments
  after insert or update or delete on public.teacher_assignments
  for each row execute function app.audit_row();
