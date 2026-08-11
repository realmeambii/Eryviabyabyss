-- ═══════════════════════════════════════════════════════════════════════════
--  Sub-administrators, and what each of them may do
-- ═══════════════════════════════════════════════════════════════════════════
--  Until now "administrator" was one thing. Anybody holding it could do
--  everything: enrol pupils, rewrite the timetable, delete results, read the
--  audit log — and, worst of all, grant the administrator role to anybody
--  including themselves. A school that wants a bursar who manages fees, or an
--  exams officer who publishes results and nothing else, had no way to say so
--  short of handing over the whole school.
--
--  The grant is the right place for this, not the role. Two people can hold
--  `administrator` and mean different things by it, so the capabilities live on
--  `user_roles` — the row that says *this person, at this school* — rather than
--  on `roles`, which is shared.
--
--  `app.is_admin()` keeps its meaning: "holds the administrator role at all".
--  It still gates the reads, because an exams officer who cannot see a class
--  list cannot do their job. What narrows is the writes, through
--  `app.admin_can(capability)`.
--
--  One administrator per school is the founder. They are `is_super`, they hold
--  every capability implicitly, no capability check can refuse them, and only
--  they may create or alter another administrator. Without that last rule the
--  whole scheme is decoration: a sub-administrator who can edit `user_roles`
--  can simply grant themselves the rest.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.user_roles
  add column if not exists is_super boolean not null default false,
  add column if not exists capabilities text[] not null default '{}';

comment on column public.user_roles.is_super is
  'The founding administrator. Holds every capability implicitly and is the '
  'only grant that may create or alter another administrator.';

comment on column public.user_roles.capabilities is
  'Which administrator functions this grant enables. Ignored when is_super. '
  'Meaningless on non-administrator roles.';

-- ── The capability vocabulary ───────────────────────────────────────────────
--  A closed set, checked by constraint. A typo in a capability name would
--  otherwise fail open in the most quiet way possible: the toggle appears to
--  work, and the policy that never matches simply denies for ever.
alter table public.user_roles
  drop constraint if exists user_roles_known_capabilities;

alter table public.user_roles
  add constraint user_roles_known_capabilities check (
    capabilities <@ array[
      'users',          -- create, edit and deactivate people
      'academics',      -- classes, subjects, sessions, enrolment, teaching
      'timetable',      -- the timetable and the bell schedule
      'results',        -- school-wide results and their publication
      'announcements',  -- school-wide announcements
      'audit',          -- the audit log
      'settings'        -- school profile and grading scale
    ]::text[]
  );

-- ── Backfill ────────────────────────────────────────────────────────────────
--  The earliest administrator grant at each school becomes the founder. Every
--  other existing administrator keeps everything they had, as explicit
--  capabilities — this migration must not quietly take powers away from
--  somebody who is using them today. Narrowing them is a decision for the
--  founder, made on the screen, not a side effect of deploying.
--  "First" means first granted. Several grants written in one transaction share
--  a `granted_at` to the microsecond, so the tie-break walks on to the user's
--  own creation and finally their id — otherwise a seeded school picks its
--  founder by whichever uuid happened to sort first, which is nobody.
with founders as (
  select distinct on (ur.school_id) ur.id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.users u on u.id = ur.user_id
   where r.slug = 'administrator'
   order by ur.school_id, ur.granted_at, u.created_at, u.id
)
update public.user_roles ur
   set is_super = true,
       capabilities = '{}'::text[]
  from founders f
 where ur.id = f.id;

update public.user_roles ur
   set capabilities = array[
         'users','academics','timetable','results','announcements','audit','settings'
       ]::text[]
  from public.roles r
 where r.id = ur.role_id
   and r.slug = 'administrator'
   and ur.is_super = false
   and ur.capabilities = '{}'::text[];

-- ═══════════════════════════════════════════════════════════════════════════
--  Helpers
-- ═══════════════════════════════════════════════════════════════════════════
--  Definer, like every other predicate in `app`. They resolve against
--  `auth.uid()`, which the role switch leaves alone — the same reasoning that
--  applies to `app.has_role()` and `app.may_message()`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.is_super_admin()
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
       and r.slug = 'administrator'
       and ur.is_super
       and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

comment on function app.is_super_admin() is
  'The founding administrator of the caller''s school. The only grant that may '
  'create or alter another administrator.';

create or replace function app.admin_can(p_capability text)
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
       and r.slug = 'administrator'
       and (ur.expires_at is null or ur.expires_at > now())
       and (ur.is_super or p_capability = any (ur.capabilities))
  );
$$;

comment on function app.admin_can(text) is
  'Whether the caller holds a given administrator capability. A super grant '
  'satisfies every capability. Strictly narrower than app.is_admin(), which '
  'still gates the reads.';

grant execute on function app.is_super_admin() to authenticated, service_role;
grant execute on function app.admin_can(text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
--  Narrowing the writes
-- ═══════════════════════════════════════════════════════════════════════════
--  Every policy below is the one that already existed with `app.is_admin()`
--  replaced by the capability it needs. Nothing else about them changes — the
--  school checks, the self-service branches and the WITH CHECK clauses are
--  reproduced exactly, because a rewrite is where an accidental widening hides.
--
--  Reads are untouched throughout. An administrator without the `academics`
--  capability still sees the class list; they simply cannot change it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── People ──────────────────────────────────────────────────────────────────

drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin on public.users
  for insert to authenticated
  with check ((select app.admin_can('users'))
              and school_id = (select app.current_school_id()));

drop policy if exists users_update_self_or_admin on public.users;
create policy users_update_self_or_admin on public.users
  for update to authenticated
  using (id = (select auth.uid())
         or ((select app.admin_can('users'))
             and school_id = (select app.current_school_id())))
  with check (id = (select auth.uid())
              or ((select app.admin_can('users'))
                  and school_id = (select app.current_school_id())));

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users
  for delete to authenticated
  using ((select app.admin_can('users'))
         and school_id = (select app.current_school_id()));

drop policy if exists students_insert_admin on public.students;
create policy students_insert_admin on public.students
  for insert to authenticated
  with check ((select app.admin_can('users'))
              and (select app.in_my_school(school_id)));

drop policy if exists students_update_self_or_admin on public.students;
create policy students_update_self_or_admin on public.students
  for update to authenticated
  using (user_id = (select auth.uid())
         or ((select app.admin_can('users')) and (select app.in_my_school(school_id))))
  with check ((select app.in_my_school(school_id)));

drop policy if exists students_delete_admin on public.students;
create policy students_delete_admin on public.students
  for delete to authenticated
  using ((select app.admin_can('users')) and (select app.in_my_school(school_id)));

drop policy if exists teachers_insert_admin on public.teachers;
create policy teachers_insert_admin on public.teachers
  for insert to authenticated
  with check ((select app.admin_can('users')) and (select app.in_my_school(school_id)));

drop policy if exists teachers_update_self_or_admin on public.teachers;
create policy teachers_update_self_or_admin on public.teachers
  for update to authenticated
  using (user_id = (select auth.uid())
         or ((select app.admin_can('users')) and (select app.in_my_school(school_id))))
  with check ((select app.in_my_school(school_id)));

drop policy if exists teachers_delete_admin on public.teachers;
create policy teachers_delete_admin on public.teachers
  for delete to authenticated
  using ((select app.admin_can('users')) and (select app.in_my_school(school_id)));

drop policy if exists parents_insert_admin on public.parents;
create policy parents_insert_admin on public.parents
  for insert to authenticated
  with check ((select app.admin_can('users')) and (select app.in_my_school(school_id)));

drop policy if exists parents_update_self_or_admin on public.parents;
create policy parents_update_self_or_admin on public.parents
  for update to authenticated
  using (user_id = (select auth.uid())
         or ((select app.admin_can('users')) and (select app.in_my_school(school_id))))
  with check ((select app.in_my_school(school_id)));

drop policy if exists parents_delete_admin on public.parents;
create policy parents_delete_admin on public.parents
  for delete to authenticated
  using ((select app.admin_can('users')) and (select app.in_my_school(school_id)));

drop policy if exists parent_students_insert_admin on public.parent_students;
create policy parent_students_insert_admin on public.parent_students
  for insert to authenticated
  with check ((select app.admin_can('users')) and (select app.in_my_school(school_id)));

drop policy if exists parent_students_update_admin on public.parent_students;
create policy parent_students_update_admin on public.parent_students
  for update to authenticated
  using ((select app.admin_can('users')) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

drop policy if exists parent_students_delete_admin on public.parent_students;
create policy parent_students_delete_admin on public.parent_students
  for delete to authenticated
  using ((select app.admin_can('users')) and (select app.in_my_school(school_id)));

-- ── Academics ───────────────────────────────────────────────────────────────

drop policy if exists classes_insert_admin on public.classes;
create policy classes_insert_admin on public.classes
  for insert to authenticated
  with check ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

drop policy if exists classes_update_admin on public.classes;
create policy classes_update_admin on public.classes
  for update to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

drop policy if exists classes_delete_admin on public.classes;
create policy classes_delete_admin on public.classes
  for delete to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

drop policy if exists subjects_insert_admin on public.subjects;
create policy subjects_insert_admin on public.subjects
  for insert to authenticated
  with check ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

drop policy if exists subjects_update_admin on public.subjects;
create policy subjects_update_admin on public.subjects
  for update to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

drop policy if exists subjects_delete_admin on public.subjects;
create policy subjects_delete_admin on public.subjects
  for delete to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

drop policy if exists class_subjects_insert_admin on public.class_subjects;
create policy class_subjects_insert_admin on public.class_subjects
  for insert to authenticated
  with check ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

drop policy if exists class_subjects_update_admin on public.class_subjects;
create policy class_subjects_update_admin on public.class_subjects
  for update to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

drop policy if exists class_subjects_delete_admin on public.class_subjects;
create policy class_subjects_delete_admin on public.class_subjects
  for delete to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

drop policy if exists academic_sessions_write_admin on public.academic_sessions;
create policy academic_sessions_write_admin on public.academic_sessions
  for insert to authenticated
  with check ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

drop policy if exists academic_sessions_update_admin on public.academic_sessions;
create policy academic_sessions_update_admin on public.academic_sessions
  for update to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

drop policy if exists academic_sessions_delete_admin on public.academic_sessions;
create policy academic_sessions_delete_admin on public.academic_sessions
  for delete to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

drop policy if exists enrollments_insert_admin on public.enrollments;
create policy enrollments_insert_admin on public.enrollments
  for insert to authenticated
  with check ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

drop policy if exists enrollments_update_admin on public.enrollments;
create policy enrollments_update_admin on public.enrollments
  for update to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

drop policy if exists enrollments_delete_admin on public.enrollments;
create policy enrollments_delete_admin on public.enrollments
  for delete to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

drop policy if exists teacher_assignments_insert_admin on public.teacher_assignments;
create policy teacher_assignments_insert_admin on public.teacher_assignments
  for insert to authenticated
  with check ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

drop policy if exists teacher_assignments_update_admin on public.teacher_assignments;
create policy teacher_assignments_update_admin on public.teacher_assignments
  for update to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

drop policy if exists teacher_assignments_delete_admin on public.teacher_assignments;
create policy teacher_assignments_delete_admin on public.teacher_assignments
  for delete to authenticated
  using ((select app.admin_can('academics')) and (select app.in_my_school(school_id)));

-- ── Timetable ───────────────────────────────────────────────────────────────

drop policy if exists timetable_insert_admin on public.timetable_slots;
create policy timetable_insert_admin on public.timetable_slots
  for insert to authenticated
  with check ((select app.admin_can('timetable')) and (select app.in_my_school(school_id)));

drop policy if exists timetable_update_admin on public.timetable_slots;
create policy timetable_update_admin on public.timetable_slots
  for update to authenticated
  using ((select app.admin_can('timetable')) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

drop policy if exists timetable_delete_admin on public.timetable_slots;
create policy timetable_delete_admin on public.timetable_slots
  for delete to authenticated
  using ((select app.admin_can('timetable')) and (select app.in_my_school(school_id)));

drop policy if exists school_periods_write_admin on public.school_periods;
create policy school_periods_write_admin on public.school_periods
  for all to authenticated
  using ((select app.admin_can('timetable')) and (select app.in_my_school(school_id)))
  with check ((select app.admin_can('timetable')) and (select app.in_my_school(school_id)));

-- ── Results ─────────────────────────────────────────────────────────────────

drop policy if exists grades_delete_admin on public.grades;
create policy grades_delete_admin on public.grades
  for delete to authenticated
  using ((select app.admin_can('results')) and (select app.in_my_school(school_id)));

-- ── The audit log ───────────────────────────────────────────────────────────

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using ((select app.admin_can('audit')) and (select app.in_my_school(school_id)));

-- ── School settings ─────────────────────────────────────────────────────────

drop policy if exists schools_update_admin on public.schools;
create policy schools_update_admin on public.schools
  for update to authenticated
  using (id = (select app.current_school_id()) and (select app.admin_can('settings')))
  with check (id = (select app.current_school_id()));

-- ═══════════════════════════════════════════════════════════════════════════
--  The grants themselves
-- ═══════════════════════════════════════════════════════════════════════════
--  This is the rule the rest depends on. A sub-administrator who can write
--  `user_roles` freely can grant themselves `is_super` and the scheme
--  evaporates, so:
--
--    · granting an ordinary role (pupil, teacher, guardian) needs `users`
--    · granting or altering an *administrator* needs `is_super`
--    · setting `is_super` or any capability needs `is_super`
--
--  The third clause is what stops a `users` administrator quietly attaching
--  capabilities to a teacher's grant and then granting themselves that role.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists user_roles_insert_admin on public.user_roles;
create policy user_roles_insert_admin on public.user_roles
  for insert to authenticated
  with check (
    school_id = (select app.current_school_id())
    and (
      (select app.is_super_admin())
      or (
        (select app.admin_can('users'))
        and role_id <> (select id from public.roles where slug = 'administrator')
        and is_super = false
        and capabilities = '{}'::text[]
      )
    )
  );

drop policy if exists user_roles_update_admin on public.user_roles;
create policy user_roles_update_admin on public.user_roles
  for update to authenticated
  using (
    school_id = (select app.current_school_id())
    and (
      (select app.is_super_admin())
      or (
        (select app.admin_can('users'))
        and role_id <> (select id from public.roles where slug = 'administrator')
      )
    )
  )
  with check (
    school_id = (select app.current_school_id())
    and (
      (select app.is_super_admin())
      or (
        (select app.admin_can('users'))
        and role_id <> (select id from public.roles where slug = 'administrator')
        and is_super = false
        and capabilities = '{}'::text[]
      )
    )
  );

drop policy if exists user_roles_delete_admin on public.user_roles;
create policy user_roles_delete_admin on public.user_roles
  for delete to authenticated
  using (
    school_id = (select app.current_school_id())
    and (
      (select app.is_super_admin())
      or (
        (select app.admin_can('users'))
        and role_id <> (select id from public.roles where slug = 'administrator')
      )
    )
  );

-- ── The founder cannot be demoted ───────────────────────────────────────────
--  Not even by themselves, and not by another founder. A school with no super
--  administrator can never appoint one again — there is no path back short of
--  the service role — so this is the one door that does not have a handle on
--  the inside.
create or replace function app.protect_founding_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_super then
      raise exception 'The founding administrator cannot be removed'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if old.is_super and not new.is_super then
    raise exception 'The founding administrator cannot be demoted'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_founding_admin on public.user_roles;
create trigger protect_founding_admin
  before update or delete on public.user_roles
  for each row execute function app.protect_founding_admin();

-- ═══════════════════════════════════════════════════════════════════════════
--  What the client needs to know
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.my_admin_capabilities()
returns table (is_super boolean, capabilities text[])
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(ur.is_super, false),
         coalesce(ur.capabilities, '{}'::text[])
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
   where ur.user_id = (select auth.uid())
     and r.slug = 'administrator'
     and (ur.expires_at is null or ur.expires_at > now())
   limit 1;
$$;

comment on function public.my_admin_capabilities() is
  'The caller''s own administrator capabilities, for gating navigation. Returns '
  'no row for a non-administrator. Not a security boundary — the policies are.';

revoke execute on function public.my_admin_capabilities() from public, anon;
grant execute on function public.my_admin_capabilities() to authenticated, service_role;

-- ── The roster the founder manages ──────────────────────────────────────────

create or replace function public.list_administrators()
returns table (
  grant_id     uuid,
  user_id      uuid,
  full_name    text,
  email        text,
  avatar_path  text,
  status       public.user_status,
  is_super     boolean,
  capabilities text[],
  granted_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ur.id, u.id, u.full_name, u.email, u.avatar_path, u.status,
         ur.is_super, ur.capabilities, ur.granted_at
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.users u on u.id = ur.user_id
   where r.slug = 'administrator'
     and ur.school_id = app.current_school_id()
     -- Only an administrator may see the list at all. Definer, because
     -- `users_select_visible` does not show one administrator to another.
     and (select app.is_admin())
   order by ur.is_super desc, u.full_name;
$$;

comment on function public.list_administrators() is
  'Every administrator at the caller''s school with their capabilities. '
  'Definer because users_select_visible does not show one administrator to '
  'another; gated on app.is_admin() inside.';

revoke execute on function public.list_administrators() from public, anon;
grant execute on function public.list_administrators() to authenticated, service_role;
