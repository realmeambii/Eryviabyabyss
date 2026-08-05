-- ═══════════════════════════════════════════════════════════════════════════
--  0500 · lessons · timetable_slots · attendance_records
-- ═══════════════════════════════════════════════════════════════════════════
--  Three tables beyond the list in the brief, each required by a stated
--  deliverable:
--    • lessons          — gives the "Lesson Materials" storage bucket and the
--                         course Lessons tab something to hang off.
--    • timetable_slots  — the brief asks for seeded timetables.
--    • attendance_records — the brief asks for an `attendance` feature module.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── lessons ────────────────────────────────────────────────────────────────
create table public.lessons (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  class_id            uuid not null references public.classes (id) on delete cascade,
  subject_id          uuid not null references public.subjects (id) on delete cascade,
  academic_session_id uuid not null references public.academic_sessions (id) on delete cascade,
  -- The authoring teacher. Keep the lesson if they leave the school.
  created_by          uuid references public.teachers (id) on delete set null,
  title               text not null check (length(btrim(title)) between 3 and 250),
  summary             text,
  content             text,
  content_type        public.lesson_content_type not null default 'note',
  -- Week 1..15 of the term; orders the syllabus view.
  week_number         smallint check (week_number between 1 and 20),
  -- `sort_order`, not `position`: POSITION is a Postgres col_name_keyword and
  -- is rejected as a function OUT-parameter name, so a column called `position`
  -- cannot be surfaced by an RPC under its own name. Same choice in
  -- quiz_questions and in get_quiz_paper().
  sort_order          integer not null default 0,
  duration_minutes    smallint check (duration_minutes between 1 and 600),
  external_url        text,
  status              public.publication_status not null default 'draft',
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint lessons_published_has_timestamp
    check (status <> 'published' or published_at is not null)
);

create index lessons_class_subject_idx
  on public.lessons (class_id, subject_id, academic_session_id, sort_order);
create index lessons_published_idx
  on public.lessons (class_id, published_at desc)
  where status = 'published';
create index lessons_created_by_idx on public.lessons (created_by);

-- ── timetable_slots ────────────────────────────────────────────────────────
--  `period` is the slot expressed as minutes-from-midnight so GiST can test it
--  for overlap. It is generated, so it can never drift from starts_at/ends_at.
create table public.timetable_slots (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  class_id            uuid not null references public.classes (id) on delete cascade,
  subject_id          uuid not null references public.subjects (id) on delete cascade,
  teacher_id          uuid references public.teachers (id) on delete set null,
  academic_session_id uuid not null references public.academic_sessions (id) on delete cascade,
  -- ISO-8601 weekday: 1 = Monday … 7 = Sunday.
  day_of_week         smallint not null check (day_of_week between 1 and 7),
  starts_at           time not null,
  ends_at             time not null,
  room                text,
  is_break            boolean not null default false,
  label               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  period int4range generated always as (
    int4range(
      (date_part('epoch', starts_at) / 60)::int,
      (date_part('epoch', ends_at) / 60)::int
    )
  ) stored,

  constraint timetable_slots_time_order check (ends_at > starts_at),

  -- A class cannot be in two places at once.
  constraint timetable_slots_no_class_clash exclude using gist (
    class_id            extensions.gist_uuid_ops with =,
    academic_session_id extensions.gist_uuid_ops with =,
    day_of_week         extensions.gist_int2_ops with =,
    period              with &&
  ),

  -- Neither can a teacher.
  constraint timetable_slots_no_teacher_clash exclude using gist (
    teacher_id          extensions.gist_uuid_ops with =,
    academic_session_id extensions.gist_uuid_ops with =,
    day_of_week         extensions.gist_int2_ops with =,
    period              with &&
  ) where (teacher_id is not null and is_break = false)
);

comment on constraint timetable_slots_no_teacher_clash on public.timetable_slots is
  'Double-booking a teacher is a data error, not a UI concern — rejected at write time.';

create index timetable_slots_class_idx
  on public.timetable_slots (class_id, academic_session_id, day_of_week, starts_at);
create index timetable_slots_teacher_idx
  on public.timetable_slots (teacher_id, academic_session_id, day_of_week, starts_at);

-- ── attendance_records ─────────────────────────────────────────────────────
create table public.attendance_records (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  student_id          uuid not null references public.students (id) on delete cascade,
  class_id            uuid not null references public.classes (id) on delete cascade,
  academic_session_id uuid not null references public.academic_sessions (id) on delete cascade,
  -- Null for a whole-day register; set for per-period attendance.
  subject_id          uuid references public.subjects (id) on delete set null,
  taken_on            date not null default current_date,
  status              public.attendance_status not null default 'present',
  minutes_late        smallint check (minutes_late is null or minutes_late between 0 and 600),
  note                text,
  recorded_by         uuid references public.teachers (id) on delete set null,
  recorded_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint attendance_not_in_future check (taken_on <= current_date),
  constraint attendance_late_only_when_late
    check (status = 'late' or minutes_late is null)
);

-- One register entry per student per day per (optional) subject. Two partial
-- indexes because NULL subject_id would otherwise never collide.
create unique index attendance_daily_unique
  on public.attendance_records (student_id, taken_on)
  where subject_id is null;
create unique index attendance_per_subject_unique
  on public.attendance_records (student_id, taken_on, subject_id)
  where subject_id is not null;

create index attendance_class_date_idx on public.attendance_records (class_id, taken_on desc);
create index attendance_student_idx    on public.attendance_records (student_id, taken_on desc);
-- Absence reports read only the exceptions.
create index attendance_exceptions_idx
  on public.attendance_records (school_id, taken_on desc)
  where status <> 'present';

-- ── updated_at triggers ────────────────────────────────────────────────────
select app.attach_updated_at('public.lessons');
select app.attach_updated_at('public.timetable_slots');
select app.attach_updated_at('public.attendance_records');
