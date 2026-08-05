-- ═══════════════════════════════════════════════════════════════════════════
--  Remove attendance from the product
-- ═══════════════════════════════════════════════════════════════════════════
--  Attendance tracking has been dropped from the LMS as a product decision, so
--  it is removed from the schema rather than left in place unused. A table
--  nothing writes to is not free: it keeps its RLS policies, its realtime
--  subscription and its place in every "what can a teacher touch" conversation,
--  and it invites the next person to build against it.
--
--  DESTRUCTIVE. `attendance_records` and everything in it are dropped. There is
--  no keep-a-copy step here on purpose — a half-removed feature whose data
--  lingers in an `attendance_records_archive` is the same problem wearing a
--  different name. Take a dump first if the rows matter:
--
--      pg_dump --table=public.attendance_records ... > attendance-backup.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The table ──────────────────────────────────────────────────────────────
--  DROP TABLE takes its policies, indexes, constraints, the updated_at trigger
--  and its membership of the `supabase_realtime` publication with it.
drop table if exists public.attendance_records;

-- Nothing references this once the table is gone.
drop type if exists public.attendance_status;

-- ── notification_type ──────────────────────────────────────────────────────
--  Postgres can append a label to an enum but never remove one, so the type is
--  rebuilt without `attendance_flagged`. Safe to do bluntly here because no row
--  has ever carried that value — nothing in the codebase raised it, the
--  notification was never wired up.
--
--  `app.notify_users` takes the type as a parameter and therefore depends on
--  it, which would block the drop. It is dropped first and recreated verbatim
--  against the new type at the bottom.

drop function if exists app.notify_users(
  uuid, uuid[], public.notification_type, text, text, text, text, uuid, uuid
);

alter type public.notification_type rename to notification_type__old;

create type public.notification_type as enum (
  'assignment_published',
  'assignment_due_soon',
  'submission_graded',
  'quiz_published',
  'quiz_reminder',
  'quiz_graded',
  'grade_posted',
  'announcement',
  'timetable_changed',
  'account',
  'system'
);

alter table public.notifications
  alter column type drop default,
  alter column type type public.notification_type
    using type::text::public.notification_type,
  alter column type set default 'system';

drop type public.notification_type__old;

-- Recreated unchanged apart from the type it now names.
create or replace function app.notify_users(
  p_school_id   uuid,
  p_user_ids    uuid[],
  p_type        public.notification_type,
  p_title       text,
  p_body        text,
  p_action_url  text default null,
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_actor_id    uuid default null
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

-- 0900 granted EXECUTE across the whole `app` schema in one statement; that ran
-- long before this function was recreated, so it needs saying again.
grant execute on function app.notify_users(
  uuid, uuid[], public.notification_type, text, text, text, text, uuid, uuid
) to authenticated, service_role;

revoke execute on function app.notify_users(
  uuid, uuid[], public.notification_type, text, text, text, text, uuid, uuid
) from anon;

-- ── Role permissions ───────────────────────────────────────────────────────
--  `roles.permissions` is read by the UI to decide which affordances to render.
--  Leaving `attendance` in the teacher's map would have the front end offering
--  a capability that no longer exists.
update public.roles
   set permissions = permissions - 'attendance'
 where permissions ? 'attendance';
