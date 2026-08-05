-- ═══════════════════════════════════════════════════════════════════════════
--  0400 · People and academic structure
--  subjects · teachers · classes · students · parents · parent_students
--  class_subjects · enrollments · teacher_assignments
-- ═══════════════════════════════════════════════════════════════════════════
--  teachers / students / parents are *profile extensions*, not duplicate
--  identities: each holds exactly one `user_id` and adds the fields that only
--  make sense for that role. A user who is both a teacher and a parent gets
--  one `users` row, two role grants and two extension rows.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── subjects ───────────────────────────────────────────────────────────────
create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 2 and 120),
  -- Short code used as the tile label in the UI ("MTH", "ENG", "CIV").
  code        text not null check (code ~ '^[A-Z]{2,6}$'),
  description text,
  department  text,
  is_core     boolean not null default false,
  -- Hex accent used by subject tiles; validated so the UI can trust it.
  color       text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint subjects_code_unique unique (school_id, code),
  constraint subjects_name_unique unique (school_id, name)
);

create index subjects_school_idx on public.subjects (school_id) where is_active;

-- ── teachers ───────────────────────────────────────────────────────────────
create table public.teachers (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id)   on delete cascade,
  school_id       uuid not null references public.schools (id) on delete cascade,
  staff_number    text not null check (length(btrim(staff_number)) > 0),
  qualification   text,
  specialization  text,
  employment_type public.employment_type not null default 'full_time',
  hire_date       date,
  bio             text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint teachers_user_unique         unique (user_id),
  constraint teachers_staff_number_unique unique (school_id, staff_number)
);

create index teachers_school_idx on public.teachers (school_id) where is_active;

-- ── classes ────────────────────────────────────────────────────────────────
--  "JSS 1 A" == name 'JSS 1', arm 'A'. `level` is the ordinal (1..6 for
--  JSS1..SS3) and is what promotion logic will sort on in Phase 2.
create table public.classes (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  academic_session_id uuid not null references public.academic_sessions (id) on delete restrict,
  name                text not null check (length(btrim(name)) > 0),
  arm                 text not null default 'A' check (arm ~ '^[A-Z]$'),
  code                text not null,
  level               smallint not null check (level between 1 and 6),
  capacity            smallint not null default 40 check (capacity between 1 and 200),
  -- A form teacher may leave; the class survives without one.
  form_teacher_id     uuid references public.teachers (id) on delete set null,
  room                text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint classes_unique_per_session unique (school_id, academic_session_id, name, arm),
  constraint classes_code_unique        unique (school_id, academic_session_id, code)
);

create index classes_school_session_idx on public.classes (school_id, academic_session_id);
create index classes_form_teacher_idx   on public.classes (form_teacher_id);

-- ── students ───────────────────────────────────────────────────────────────
create table public.students (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id)   on delete cascade,
  school_id        uuid not null references public.schools (id) on delete cascade,
  admission_number text not null check (length(btrim(admission_number)) > 0),
  admission_date   date not null default current_date,
  -- Denormalised pointer to the class the student sits in *right now*. The
  -- authoritative history lives in `enrollments`; this exists so the hot path
  -- ("what is my timetable?") does not need a session join.
  current_class_id uuid references public.classes (id) on delete set null,
  status           public.student_status not null default 'active',
  blood_group      text check (blood_group is null or blood_group ~ '^(A|B|AB|O)[+-]$'),
  medical_notes    text,
  address          text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint students_user_unique             unique (user_id),
  constraint students_admission_number_unique unique (school_id, admission_number)
);

create index students_school_idx        on public.students (school_id, status);
create index students_current_class_idx on public.students (current_class_id);

-- ── parents ────────────────────────────────────────────────────────────────
create table public.parents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id)   on delete cascade,
  school_id    uuid not null references public.schools (id) on delete cascade,
  occupation   text,
  employer     text,
  address      text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint parents_user_unique unique (user_id)
);

create index parents_school_idx on public.parents (school_id);

-- ── parent_students ────────────────────────────────────────────────────────
--  Beyond the table list in the brief, but unavoidable: "parents only access
--  their children's records" is a many-to-many predicate (siblings share a
--  parent; a child has two guardians), and every parent-side RLS policy in
--  0900/1000 resolves through this table.
create table public.parent_students (
  id                 uuid primary key default gen_random_uuid(),
  parent_id          uuid not null references public.parents (id)  on delete cascade,
  student_id         uuid not null references public.students (id) on delete cascade,
  school_id          uuid not null references public.schools (id)  on delete cascade,
  relationship       public.guardian_relationship not null default 'guardian',
  is_primary_contact boolean not null default false,
  can_pick_up        boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint parent_students_unique unique (parent_id, student_id)
);

create index parent_students_student_idx on public.parent_students (student_id);
create index parent_students_parent_idx  on public.parent_students (parent_id);

-- Exactly one primary contact per student.
create unique index parent_students_one_primary_per_student
  on public.parent_students (student_id)
  where is_primary_contact;

-- ── class_subjects ─────────────────────────────────────────────────────────
--  Which subjects a class is taught in a given term, and how much of the term
--  grade each one carries.
create table public.class_subjects (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  class_id            uuid not null references public.classes (id) on delete cascade,
  subject_id          uuid not null references public.subjects (id) on delete cascade,
  academic_session_id uuid not null references public.academic_sessions (id) on delete cascade,
  periods_per_week    smallint not null default 3 check (periods_per_week between 1 and 20),
  is_compulsory       boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint class_subjects_unique unique (class_id, subject_id, academic_session_id)
);

create index class_subjects_subject_idx on public.class_subjects (subject_id, academic_session_id);
create index class_subjects_class_idx   on public.class_subjects (class_id, academic_session_id);

-- ── enrollments ────────────────────────────────────────────────────────────
--  The authoritative student↔class history. One active enrolment per student
--  per term.
create table public.enrollments (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  student_id          uuid not null references public.students (id) on delete cascade,
  class_id            uuid not null references public.classes (id) on delete restrict,
  academic_session_id uuid not null references public.academic_sessions (id) on delete restrict,
  roll_number         smallint check (roll_number > 0),
  status              public.enrollment_status not null default 'active',
  enrolled_on         date not null default current_date,
  completed_on        date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint enrollments_one_per_term unique (student_id, academic_session_id),
  constraint enrollments_roll_unique  unique (class_id, academic_session_id, roll_number),
  constraint enrollments_completed_after_enrolled
    check (completed_on is null or completed_on >= enrolled_on)
);

create index enrollments_class_idx   on public.enrollments (class_id, academic_session_id);
create index enrollments_student_idx on public.enrollments (student_id);
-- The single hottest RLS probe: "is this student in a class I teach?"
create index enrollments_active_lookup_idx
  on public.enrollments (class_id, student_id)
  where status = 'active';

-- ── teacher_assignments ────────────────────────────────────────────────────
--  Who teaches what, to whom, when. Every teacher-side RLS policy resolves
--  through this table.
create table public.teacher_assignments (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id)  on delete cascade,
  teacher_id          uuid not null references public.teachers (id) on delete cascade,
  class_id            uuid not null references public.classes (id)  on delete cascade,
  subject_id          uuid not null references public.subjects (id) on delete cascade,
  academic_session_id uuid not null references public.academic_sessions (id) on delete cascade,
  -- The lead teacher owns the syllabus and the final grade for the pairing.
  is_lead             boolean not null default true,
  assigned_on         date not null default current_date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint teacher_assignments_unique
    unique (teacher_id, class_id, subject_id, academic_session_id)
);

create index teacher_assignments_teacher_idx
  on public.teacher_assignments (teacher_id, academic_session_id);
create index teacher_assignments_class_subject_idx
  on public.teacher_assignments (class_id, subject_id, academic_session_id);
-- Backs app.teaches_class(); covering so the predicate never touches the heap.
create index teacher_assignments_rls_idx
  on public.teacher_assignments (teacher_id, class_id) include (subject_id);

-- Only one lead per class+subject+term.
create unique index teacher_assignments_one_lead
  on public.teacher_assignments (class_id, subject_id, academic_session_id)
  where is_lead;

-- ── updated_at triggers ────────────────────────────────────────────────────
select app.attach_updated_at('public.subjects');
select app.attach_updated_at('public.teachers');
select app.attach_updated_at('public.classes');
select app.attach_updated_at('public.students');
select app.attach_updated_at('public.parents');
select app.attach_updated_at('public.parent_students');
select app.attach_updated_at('public.class_subjects');
select app.attach_updated_at('public.enrollments');
select app.attach_updated_at('public.teacher_assignments');
