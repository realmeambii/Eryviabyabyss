-- ═══════════════════════════════════════════════════════════════════════════
--  Staff contact details, and a display name that could be anything
-- ═══════════════════════════════════════════════════════════════════════════
--  Two findings from an end-to-end test pass, both on `public.users`.
--
--  ── 1. Every pupil could read every teacher's mobile number ────────────────
--
--  `users_select_visible` → `app.can_read_user()` deliberately makes staff rows
--  visible school-wide, and the comment there is right about why: "students
--  need to be able to see who teaches them". A name and a face have to render
--  on a timetable, in a message thread and on a class page.
--
--  What was not intended is that `phone` and `date_of_birth` ride along on that
--  row. Measured against the seeded school: all 200 pupils and 150 guardians
--  could read all 20 teachers' personal mobile numbers and birthdays. In a
--  secondary school that is a safeguarding problem, not a tidiness one.
--
--  RLS cannot express this — it is row-level, and the row is legitimately
--  visible. Column privileges are the only mechanism Postgres offers, so the
--  two columns are revoked from `authenticated` and the legitimate readers are
--  served by a definer RPC that re-asks who is entitled to them.
--
--  Who is entitled, unchanged from today:
--    · you, about yourself
--    · an administrator holding the `users` capability
--    · a teacher, about a pupil they teach — and about that pupil's guardians
--
--  Who loses access: pupils and guardians, about staff. Nobody else.
--
--  ── 2. `full_name` was directly writable and could disagree with the parts ──
--
--  `sync_user_full_name` fired `ON UPDATE OF first_name, middle_name,
--  last_name, email`, so a request that touched only `full_name` never woke it
--  and the value stuck. `users_update_self_or_admin` lets anyone edit their own
--  row, so a pupil could PATCH `full_name` to any string and it would persist
--  while `first_name`/`last_name` still said otherwise.
--
--  That name is what renders in the message picker, on a class roster and as
--  the actor on an audit entry, so it is an impersonation vector: a pupil could
--  appear as a member of staff. Found by accident during testing, when a probe
--  left a pupil displaying as "Legit" over the parts "Chiamaka Balogun".
--
--  The trigger now fires on every UPDATE. `app.sync_user_full_name()` simply
--  recomputes from the parts, so a direct write to `full_name` is overwritten
--  rather than rejected — the column becomes derived in fact as well as intent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 2 first: it is small and independent ────────────────────────────────────

drop trigger if exists sync_user_full_name on public.users;
create trigger sync_user_full_name
  before insert or update on public.users
  for each row execute function app.sync_user_full_name();

comment on column public.users.full_name is
  'Derived from the name parts by app.sync_user_full_name() on every write. '
  'Never trust a value written to this column directly — it is recomputed.';

-- ── 1. Who may read a contact detail ────────────────────────────────────────

create or replace function app.may_read_contact(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Yourself.
    p_user_id = (select auth.uid())

    -- The office, when it manages people at all.
    or (select app.admin_can('users'))

    -- A teacher, about a pupil they teach.
    or exists (
         select 1 from public.students s
          where s.user_id = p_user_id and (select app.teaches_student(s.id)))

    -- …and about that pupil's guardians, which is the number they actually
    -- need: ringing a parent is the point of holding it.
    or exists (
         select 1
           from public.parents p
           join public.parent_students ps on ps.parent_id = p.id
          where p.user_id = p_user_id and (select app.teaches_student(ps.student_id)));
$$;

comment on function app.may_read_contact(uuid) is
  'Whether the caller may see a person''s phone number and date of birth. '
  'Strictly narrower than app.can_read_user(), which governs the row itself.';

grant execute on function app.may_read_contact(uuid) to authenticated, service_role;

-- ── The revoke ──────────────────────────────────────────────────────────────
--  Column privileges are all-or-nothing per role, so the table grant is
--  replaced by an explicit column list. Every column except the two is granted
--  back; a column added later is *not* readable until it is added here, which
--  is the failure direction to prefer.
--
--  INSERT and UPDATE are untouched: a person still sets their own phone number,
--  and the Edge Function still writes one when it provisions an account. This
--  is about reading somebody else's.

revoke select on public.users from authenticated;

grant select (
  id, school_id, email,
  first_name, middle_name, last_name, full_name,
  avatar_path, gender, status, locale, timezone,
  notification_preferences, metadata, last_seen_at,
  created_at, updated_at
) on public.users to authenticated;

-- ── The compensating read ───────────────────────────────────────────────────
--  Definer, so it can read the two revoked columns, with `may_read_contact()`
--  as the gate on every row. Batched by id because the callers are lists — an
--  admin's guardian directory is 150 rows and 150 round trips is not a design.

create or replace function public.contact_details(p_user_ids uuid[])
returns table (user_id uuid, phone text, date_of_birth date)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.phone, u.date_of_birth
    from public.users u
   where u.id = any (p_user_ids)
     and u.school_id = app.current_school_id()
     and app.may_read_contact(u.id);
$$;

comment on function public.contact_details(uuid[]) is
  'Phone and date of birth for the given people, filtered to those the caller '
  'is entitled to. Exists because the columns are revoked from authenticated: '
  'a staff row is visible school-wide so pupils can see who teaches them, and '
  'the contact details must not ride along on it.';

revoke execute on function public.contact_details(uuid[]) from public, anon;
grant execute on function public.contact_details(uuid[]) to authenticated, service_role;

-- ── search_students() drops the phone it never had ──────────────────────────
--  The OUT column existed but is null for every pupil in practice — a school
--  holds the *guardian's* number, not an eleven-year-old's. Keeping it would
--  mean either flipping this function to definer, which would change how it is
--  scoped, or leaving it broken by the revoke. Dropping it costs nothing.
--
--  Byte-for-byte the original otherwise: same parameter types, same OUT column
--  order, same email match, same ordering, same clamp. DROP then CREATE because
--  `create or replace` will not change a function's OUT columns.

drop function if exists public.search_students(text, uuid, public.student_status, integer, integer);

create function public.search_students(
  p_query    text default null,
  p_class_id uuid default null,
  p_status   public.student_status default null,
  p_limit    integer default 25,
  p_offset   integer default 0
)
returns table (
  id               uuid,
  admission_number text,
  admission_date   date,
  status           public.student_status,
  current_class_id uuid,
  user_id          uuid,
  full_name        text,
  email            text,
  avatar_path      text,
  user_status      public.user_status,
  class_name       text,
  class_arm        text,
  total_count      bigint
)
language sql
stable
set search_path = ''
as $$
  with matched as (
    select s.id,
           s.admission_number,
           s.admission_date,
           s.status,
           s.current_class_id,
           s.user_id,
           u.full_name,
           u.email,
           u.avatar_path,
           u.status as user_status,
           c.name as class_name,
           c.arm  as class_arm
      from public.students s
      join public.users u on u.id = s.user_id
      left join public.classes c on c.id = s.current_class_id
     where (p_class_id is null or s.current_class_id = p_class_id)
       and (p_status is null or s.status = p_status)
       and (
         p_query is null
         or btrim(p_query) = ''
         or u.full_name        ilike '%' || btrim(p_query) || '%'
         or s.admission_number ilike '%' || btrim(p_query) || '%'
         or u.email            ilike '%' || btrim(p_query) || '%'
       )
  )
  select m.*, count(*) over () as total_count
    from matched m
   order by m.admission_number
   -- Clamped so a crafted request cannot ask for the whole register in one go.
   limit  greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.search_students(text, uuid, public.student_status, integer, integer) is
  'Paged student directory. SECURITY INVOKER — RLS on students and users does '
  'the scoping. No phone column: it was null for every pupil, and the column is '
  'now revoked from authenticated anyway.';

revoke execute on function public.search_students(text, uuid, public.student_status, integer, integer)
  from public, anon;
grant execute on function public.search_students(text, uuid, public.student_status, integer, integer)
  to authenticated, service_role;
