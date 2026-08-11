-- ═══════════════════════════════════════════════════════════════════════════
--  The bell schedule, and letting teachers claim a period
-- ═══════════════════════════════════════════════════════════════════════════
--  Two gaps, one cause. `timetable_slots` stores a start and end time per row,
--  so the school's period structure existed only as a coincidence of the times
--  that happened to be in the table. There was no way to ask "which periods are
--  free on Wednesday" — the question a teacher claiming a period is asking, and
--  the question an editor grid has to answer before it can draw a row.
--
--  So the bell schedule becomes a table, and the timetable references it by
--  matching times rather than by a foreign key. That is deliberate: an
--  administrator is allowed to place a lesson at any time at all, including one
--  that does not line up with the bells (a double period before an exam, a
--  Saturday clinic). A foreign key would forbid that. The grid is a scaffold
--  for the common case, not a constraint on the office.
--
--  Teachers are constrained to it, because "first come, first served" only
--  means anything if everybody is competing for the same slots.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.school_periods (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  position    smallint not null,
  label       text,
  starts_at   time not null,
  ends_at     time not null,
  is_break    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint school_periods_position_check check (position >= 1 and position <= 20),
  constraint school_periods_time_order check (ends_at > starts_at),
  constraint school_periods_unique_position unique (school_id, position),
  -- Two periods cannot start at the same minute. Without this a school could
  -- define an ambiguous grid and the claim policy below would match both.
  constraint school_periods_unique_start unique (school_id, starts_at)
);

create index if not exists school_periods_school_idx
  on public.school_periods (school_id, position);

comment on table public.school_periods is
  'The school''s bell schedule. Teachers may only claim timetable slots that '
  'line up with a non-break period here; administrators are not restricted to it.';

drop trigger if exists set_updated_at_school_periods on public.school_periods;
create trigger set_updated_at_school_periods
  before update on public.school_periods
  for each row execute function app.set_updated_at();

alter table public.school_periods enable row level security;

-- Everyone in the school reads the bell schedule: a pupil's timetable renders
-- against it, and it discloses nothing beyond what a bell already announces.
drop policy if exists school_periods_select_school on public.school_periods;
create policy school_periods_select_school on public.school_periods
  for select to authenticated
  using ((select app.in_my_school(school_id)));

drop policy if exists school_periods_write_admin on public.school_periods;
create policy school_periods_write_admin on public.school_periods
  for all to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)))
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

grant select on public.school_periods to authenticated;
grant insert, update, delete on public.school_periods to authenticated;

-- ── Backfill from what the timetable already implies ────────────────────────
--  The seeded school has a seven-band day. Deriving it from the existing rows
--  keeps every timetable that already exists aligned to the new grid, which a
--  hand-written default would not.
insert into public.school_periods (school_id, position, label, starts_at, ends_at, is_break)
select s.school_id,
       (row_number() over (partition by s.school_id order by s.starts_at))::smallint,
       case when s.is_break then coalesce(s.label, 'Break') else null end,
       s.starts_at,
       s.ends_at,
       s.is_break
  from (
    select distinct school_id, starts_at, ends_at, is_break,
           min(label) as label
      from public.timetable_slots
     group by school_id, starts_at, ends_at, is_break
  ) s
on conflict (school_id, starts_at) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
--  Who placed a slot
-- ═══════════════════════════════════════════════════════════════════════════
--  A teacher must be able to undo their own claim — they will put Chemistry on
--  the wrong Tuesday — but must not be able to delete a lesson the office
--  timetabled for them. Both rows carry the same `teacher_id`, so that column
--  cannot tell them apart.
--
--  `claimed_by` does: null means the office placed it, non-null means a teacher
--  took it themselves. The delete policy keys on it.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.timetable_slots
  add column if not exists claimed_by uuid references public.users(id) on delete set null;

comment on column public.timetable_slots.claimed_by is
  'The teacher who claimed this period themselves. Null when the office placed '
  'it — which is what stops a teacher deleting a lesson they were timetabled for.';

-- ═══════════════════════════════════════════════════════════════════════════
--  First come, first served
-- ═══════════════════════════════════════════════════════════════════════════
--  The race is already settled correctly and always was: two GIST exclusion
--  constraints on `timetable_slots` mean the second concurrent insert for the
--  same class-period, or the same teacher-period, fails with 23P01. That is a
--  genuine first-come-first-served, decided by the database under concurrency
--  rather than by a read-then-write in application code that two teachers can
--  interleave.
--
--  What was missing is any way for a teacher to enter the race at all —
--  `timetable_insert_admin` was the only INSERT policy. These two policies open
--  it, narrowly:
--
--    · the subject must be one they are assigned to teach in that class
--      (`teaches_class_subject`, the same predicate the rest of the schema uses)
--    · the row must name them as the teacher — you cannot claim on behalf of
--      a colleague, or place an unstaffed lesson
--    · it must be marked as their own claim, so the delete policy can tell it
--      apart from an office placement
--    · the time must line up with a non-break period in the bell schedule
--    · breaks are not claimable
--
--  Everything else — the clash itself — is left to the exclusion constraints.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists timetable_insert_teacher on public.timetable_slots;
create policy timetable_insert_teacher on public.timetable_slots
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and is_break = false
    and teacher_id is not null
    and teacher_id = (select app.current_teacher_id())
    and claimed_by = (select auth.uid())
    and (select app.teaches_class_subject(class_id, subject_id))
    and exists (
      select 1
        from public.school_periods p
       where p.school_id = timetable_slots.school_id
         and p.starts_at = timetable_slots.starts_at
         and p.ends_at   = timetable_slots.ends_at
         and p.is_break  = false
    )
  );

drop policy if exists timetable_delete_own_claim on public.timetable_slots;
create policy timetable_delete_own_claim on public.timetable_slots
  for delete to authenticated
  using (
    claimed_by = (select auth.uid())
    and teacher_id = (select app.current_teacher_id())
  );

-- ═══════════════════════════════════════════════════════════════════════════
--  What is free
-- ═══════════════════════════════════════════════════════════════════════════
--  A teacher deciding whether to claim Wednesday period 3 needs two facts the
--  client cannot assemble from its own reads: whether that class is already
--  busy, and whether *they* are already busy elsewhere. The second is the one
--  RLS hides — `timetable_select_authorised` shows a teacher only the classes
--  they can read plus their own slots, which is enough to answer it, but a
--  pupil-facing table scan per cell is not.
--
--  SECURITY DEFINER because it must answer "is this class busy" for a class the
--  caller may not read, and "are you busy" without disclosing with whom. It
--  returns booleans and a subject name, never another teacher's identity, and
--  it answers only for a class the caller actually teaches.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.timetable_availability(
  p_class_id   uuid,
  p_session_id uuid
)
returns table (
  period_id       uuid,
  -- Not `position`: it is a function-name keyword and cannot name an OUT
  -- column, though it is legal as a table column.
  period_position smallint,
  starts_at       time,
  ends_at         time,
  is_break        boolean,
  day_of_week     smallint,
  slot_id         uuid,
  taken_subject   text,
  taken_by_me     boolean,
  claimed_by_me   boolean,
  teacher_busy    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select app.current_teacher_id() as teacher_id,
           app.current_school_id()  as school_id
  ),
  -- Refuse to answer about a class the caller does not teach. An empty result
  -- rather than an error: the grid renders as "nothing to show", and no
  -- probe of another class's timetable succeeds.
  allowed as (
    select 1
      from public.teacher_assignments ta, me
     where ta.teacher_id = me.teacher_id
       and ta.class_id = p_class_id
       and ta.academic_session_id = p_session_id
     limit 1
  ),
  grid as (
    select p.id, p.position, p.starts_at, p.ends_at, p.is_break, d.day
      from public.school_periods p, me,
           generate_series(1, 5) as d(day)
     where p.school_id = me.school_id
  )
  select g.id,
         g.position,
         g.starts_at,
         g.ends_at,
         g.is_break,
         g.day::smallint,
         case when g.is_break then null else slot.id end,
         -- A break carries a subject in the seeded data because the row has to
         -- satisfy a NOT NULL. Reporting it would draw "Mathematics" across the
         -- morning break, so a break reports as a break and nothing else.
         case when g.is_break then null else sub.name end,
         coalesce(not g.is_break and slot.teacher_id = me.teacher_id, false),
         coalesce(not g.is_break and slot.claimed_by is not null
                  and slot.teacher_id = me.teacher_id, false),
         -- Am I teaching somewhere else at this hour? Answered without saying
         -- where or to whom.
         not g.is_break and exists (
           select 1
             from public.timetable_slots other
            where other.teacher_id = me.teacher_id
              and other.academic_session_id = p_session_id
              and other.day_of_week = g.day
              and other.starts_at < g.ends_at
              and other.ends_at > g.starts_at
              and other.is_break = false
              and (slot.id is null or other.id <> slot.id)
         )
    from grid g
    cross join me
    left join public.timetable_slots slot
           on slot.class_id = p_class_id
          and slot.academic_session_id = p_session_id
          and slot.day_of_week = g.day
          and slot.starts_at = g.starts_at
    left join public.subjects sub on sub.id = slot.subject_id
   where exists (select 1 from allowed)
   order by g.day, g.position;
$$;

comment on function public.timetable_availability(uuid, uuid) is
  'The weekly grid for a class the caller teaches, marking each cell as free, '
  'taken, or unavailable because the caller is already teaching elsewhere. '
  'Definer so it can see the whole class timetable and the caller''s own '
  'clashes; discloses no other teacher''s identity.';

revoke execute on function public.timetable_availability(uuid, uuid) from public, anon;
grant execute on function public.timetable_availability(uuid, uuid) to authenticated, service_role;
