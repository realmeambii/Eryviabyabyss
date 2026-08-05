-- ═══════════════════════════════════════════════════════════════════════════
--  0900 · RLS predicate helpers
-- ═══════════════════════════════════════════════════════════════════════════
--  Why these are SECURITY DEFINER:
--    a policy on `user_roles` that itself queries `user_roles` would recurse
--    forever. Running the lookup as the table owner (which bypasses RLS)
--    breaks the cycle. That is safe here because every function is a *boolean
--    question about the caller* — none of them return another user's data.
--
--  Why they are STABLE:
--    the planner may then evaluate them once per statement instead of once per
--    row. Policies additionally wrap each call as `(select app.x())` so
--    Postgres hoists it into an InitPlan — the difference between one lookup
--    and 200 000 of them on a large scan.
--
--  Why `search_path = ''`:
--    a SECURITY DEFINER function that resolves `users` through the caller's
--    search_path can be pointed at an attacker-owned table. Everything below
--    is schema-qualified.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Identity ───────────────────────────────────────────────────────────────

create or replace function app.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.school_id from public.users u where u.id = (select auth.uid());
$$;

create or replace function app.has_role(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.user_id = (select auth.uid())
       and r.slug = p_slug
       and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function app.is_admin()   returns boolean language sql stable
  security definer set search_path = '' as $$ select app.has_role('administrator'); $$;

create or replace function app.is_teacher() returns boolean language sql stable
  security definer set search_path = '' as $$ select app.has_role('teacher'); $$;

create or replace function app.is_student() returns boolean language sql stable
  security definer set search_path = '' as $$ select app.has_role('student'); $$;

create or replace function app.is_parent()  returns boolean language sql stable
  security definer set search_path = '' as $$ select app.has_role('parent'); $$;

-- ── Role-extension ids for the current user ────────────────────────────────

create or replace function app.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.students s where s.user_id = (select auth.uid());
$$;

create or replace function app.current_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.teachers t where t.user_id = (select auth.uid());
$$;

create or replace function app.current_parent_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.parents p where p.user_id = (select auth.uid());
$$;

-- ── Same-school test ───────────────────────────────────────────────────────
--  The outermost gate on nearly every policy. A null school_id (a user an
--  administrator has not yet placed) never matches anything.

create or replace function app.in_my_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_school_id is not null and p_school_id = app.current_school_id();
$$;

-- ── Teacher scope ──────────────────────────────────────────────────────────

create or replace function app.teaches_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.teacher_assignments ta
      join public.teachers t on t.id = ta.teacher_id
     where t.user_id = (select auth.uid())
       and ta.class_id = p_class_id
  )
  or exists (
    -- A form teacher owns their whole class, not just the subjects they teach.
    select 1
      from public.classes c
      join public.teachers t on t.id = c.form_teacher_id
     where c.id = p_class_id
       and t.user_id = (select auth.uid())
  );
$$;

create or replace function app.teaches_class_subject(p_class_id uuid, p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.teacher_assignments ta
      join public.teachers t on t.id = ta.teacher_id
     where t.user_id = (select auth.uid())
       and ta.class_id = p_class_id
       and ta.subject_id = p_subject_id
  );
$$;

create or replace function app.teaches_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.enrollments e
      join public.teacher_assignments ta
        on ta.class_id = e.class_id
       and ta.academic_session_id = e.academic_session_id
      join public.teachers t on t.id = ta.teacher_id
     where e.student_id = p_student_id
       and e.status = 'active'
       and t.user_id = (select auth.uid())
  );
$$;

-- ── Parent scope ───────────────────────────────────────────────────────────

create or replace function app.is_my_child(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.parent_students ps
      join public.parents p on p.id = ps.parent_id
     where ps.student_id = p_student_id
       and p.user_id = (select auth.uid())
  );
$$;

create or replace function app.my_children()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ps.student_id
    from public.parent_students ps
    join public.parents p on p.id = ps.parent_id
   where p.user_id = (select auth.uid());
$$;

-- ── Student scope ──────────────────────────────────────────────────────────

create or replace function app.is_enrolled_in(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.enrollments e
      join public.students s on s.id = e.student_id
     where e.class_id = p_class_id
       and e.status = 'active'
       and s.user_id = (select auth.uid())
  );
$$;

-- Every class the caller can legitimately see rows for, whatever their role.
-- One helper keeps the class-scoped policies (lessons, timetable, assignments,
-- announcements) short and consistent.
create or replace function app.can_read_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_admin()
      or app.teaches_class(p_class_id)
      or app.is_enrolled_in(p_class_id)
      or exists (
           select 1
             from public.enrollments e
            where e.class_id = p_class_id
              and e.status = 'active'
              and e.student_id in (select app.my_children())
         );
$$;

-- The composite used by every student-record policy.
create or replace function app.can_read_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_admin()
      or p_student_id = app.current_student_id()
      or app.is_my_child(p_student_id)
      or app.teaches_student(p_student_id);
$$;

-- ── Profile visibility ─────────────────────────────────────────────────────
--  RLS is row-level, so exposing a `users` row exposes every column on it —
--  including date of birth and phone number. This predicate is therefore
--  deliberately narrow: you see yourself, staff of your school, and the people
--  you are directly responsible for.
create or replace function app.can_read_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Yourself.
    p_user_id = (select auth.uid())

    -- Administrators see everyone in their own school.
    or (app.is_admin() and exists (
          select 1 from public.users u
           where u.id = p_user_id and u.school_id = app.current_school_id()))

    -- Staff profiles are visible to every member of the same school: students
    -- need to be able to see who teaches them.
    or exists (
         select 1
           from public.teachers t
           join public.users u on u.id = t.user_id
          where t.user_id = p_user_id
            and u.school_id = app.current_school_id())

    -- A teacher sees the students they teach…
    or exists (
         select 1 from public.students s
          where s.user_id = p_user_id and app.teaches_student(s.id))

    -- …and those students' guardians.
    or exists (
         select 1
           from public.parents p
           join public.parent_students ps on ps.parent_id = p.id
          where p.user_id = p_user_id and app.teaches_student(ps.student_id))

    -- A parent sees their own children.
    or exists (
         select 1 from public.students s
          where s.user_id = p_user_id and app.is_my_child(s.id));
$$;

-- ── Privilege grants ───────────────────────────────────────────────────────
--  Policies are evaluated as the *querying* role, so `authenticated` needs
--  EXECUTE. `anon` does not: an unauthenticated request has no auth.uid() and
--  every policy denies it anyway.
grant execute on all functions in schema app to authenticated, service_role;

revoke execute on all functions in schema app from anon;
revoke execute on function app.attach_updated_at(regclass) from authenticated;
