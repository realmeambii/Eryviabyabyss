-- ═══════════════════════════════════════════════════════════════════════════
--  0600 · Assessment
--  assignments · assignment_submissions · quizzes · quiz_questions
--  quiz_attempts · grades
-- ═══════════════════════════════════════════════════════════════════════════

-- ── assignments ────────────────────────────────────────────────────────────
create table public.assignments (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  class_id            uuid not null references public.classes (id) on delete cascade,
  subject_id          uuid not null references public.subjects (id) on delete restrict,
  academic_session_id uuid not null references public.academic_sessions (id) on delete restrict,
  lesson_id           uuid references public.lessons (id) on delete set null,
  created_by          uuid references public.teachers (id) on delete set null,
  title               text not null check (length(btrim(title)) between 3 and 250),
  description         text,
  instructions        text,
  assessment_type     public.assessment_type not null default 'homework',
  max_score           numeric(6, 2) not null default 100 check (max_score > 0),
  -- Share of the term grade, 0–1. Summed per subject when computing reports.
  weight              numeric(5, 4) not null default 0.1 check (weight >= 0 and weight <= 1),
  status              public.publication_status not null default 'draft',
  published_at        timestamptz,
  due_at              timestamptz not null,
  -- Hard cut-off. After this, no submission is accepted at all.
  closes_at           timestamptz,
  allow_late          boolean not null default true,
  late_penalty_percent numeric(5, 2) not null default 0
    check (late_penalty_percent >= 0 and late_penalty_percent <= 100),
  allow_resubmission  boolean not null default false,
  max_attempts        smallint not null default 1 check (max_attempts between 1 and 10),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint assignments_close_after_due
    check (closes_at is null or closes_at >= due_at),
  constraint assignments_published_has_timestamp
    check (status <> 'published' or published_at is not null)
);

create index assignments_class_idx
  on public.assignments (class_id, academic_session_id, due_at desc);
create index assignments_subject_idx on public.assignments (subject_id, academic_session_id);
create index assignments_created_by_idx on public.assignments (created_by);
-- Drives the student "what's due" list and the reminder Edge Function.
create index assignments_due_soon_idx
  on public.assignments (due_at)
  where status = 'published';

-- ── assignment_submissions ─────────────────────────────────────────────────
create table public.assignment_submissions (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.students (id)   on delete cascade,
  attempt       smallint not null default 1 check (attempt between 1 and 10),
  content       text,
  status        public.submission_status not null default 'draft',
  submitted_at  timestamptz,
  -- Set by app.flag_late_submission() against the parent assignment's due_at,
  -- so it is decided by the database clock, never by the client.
  is_late       boolean not null default false,
  score         numeric(6, 2) check (score >= 0),
  feedback      text,
  graded_by     uuid references public.teachers (id) on delete set null,
  graded_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint assignment_submissions_unique unique (assignment_id, student_id, attempt),
  constraint assignment_submissions_graded_has_score
    check (status <> 'graded' or (score is not null and graded_at is not null)),
  constraint assignment_submissions_submitted_has_timestamp
    check (status = 'draft' or submitted_at is not null)
);

create index assignment_submissions_assignment_idx
  on public.assignment_submissions (assignment_id, status);
create index assignment_submissions_student_idx
  on public.assignment_submissions (student_id, submitted_at desc);
-- The teacher grading queue.
create index assignment_submissions_pending_idx
  on public.assignment_submissions (assignment_id)
  where status in ('submitted', 'late', 'resubmitted');

-- ── quizzes ────────────────────────────────────────────────────────────────
create table public.quizzes (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  class_id            uuid not null references public.classes (id) on delete cascade,
  subject_id          uuid not null references public.subjects (id) on delete restrict,
  academic_session_id uuid not null references public.academic_sessions (id) on delete restrict,
  lesson_id           uuid references public.lessons (id) on delete set null,
  created_by          uuid references public.teachers (id) on delete set null,
  title               text not null check (length(btrim(title)) between 3 and 250),
  description         text,
  instructions        text,
  assessment_type     public.assessment_type not null default 'quiz',
  duration_minutes    smallint not null default 30 check (duration_minutes between 1 and 300),
  total_points        numeric(7, 2) not null default 0 check (total_points >= 0),
  passing_percentage  numeric(5, 2) not null default 50
    check (passing_percentage >= 0 and passing_percentage <= 100),
  weight              numeric(5, 4) not null default 0.1 check (weight >= 0 and weight <= 1),
  max_attempts        smallint not null default 1 check (max_attempts between 1 and 10),
  shuffle_questions   boolean not null default true,
  shuffle_options     boolean not null default true,
  show_results_immediately boolean not null default false,
  status              public.publication_status not null default 'draft',
  published_at        timestamptz,
  opens_at            timestamptz,
  closes_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint quizzes_window_order check (closes_at is null or opens_at is null or closes_at > opens_at),
  constraint quizzes_published_has_timestamp
    check (status <> 'published' or published_at is not null)
);

create index quizzes_class_idx on public.quizzes (class_id, academic_session_id, opens_at desc);
create index quizzes_open_idx  on public.quizzes (opens_at, closes_at) where status = 'published';
create index quizzes_created_by_idx on public.quizzes (created_by);

-- ── quiz_questions ─────────────────────────────────────────────────────────
--  `correct_answers` is the reason students have NO select policy on this
--  table. They receive the paper through public.get_quiz_paper(), which
--  strips the answer key; grading happens in public.submit_quiz_attempt().
create table public.quiz_questions (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete cascade,
  quiz_id        uuid not null references public.quizzes (id) on delete cascade,
  -- See the note in 0500: POSITION is a col_name_keyword, so a column of that
  -- name cannot be returned by get_quiz_paper() under its own name.
  sort_order     smallint not null check (sort_order > 0),
  question_type  public.question_type not null default 'multiple_choice',
  prompt         text not null check (length(btrim(prompt)) > 0),
  -- [{"id":"a","label":"…"}, …] — null for short_answer / essay.
  options        jsonb,
  -- ["a"] or ["a","c"] — never leaves the database for a student.
  correct_answers jsonb,
  points         numeric(6, 2) not null default 1 check (points > 0),
  explanation    text,
  media_path     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint quiz_questions_order_unique unique (quiz_id, sort_order),
  constraint quiz_questions_options_are_array
    check (options is null or jsonb_typeof(options) = 'array'),
  constraint quiz_questions_answers_are_array
    check (correct_answers is null or jsonb_typeof(correct_answers) = 'array'),
  -- Objective questions must ship both a list of options and an answer key.
  constraint quiz_questions_objective_is_complete check (
    question_type not in ('multiple_choice', 'multiple_select', 'true_false')
    or (options is not null and jsonb_array_length(options) >= 2
        and correct_answers is not null and jsonb_array_length(correct_answers) >= 1)
  )
);

create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, sort_order);

-- ── quiz_attempts ──────────────────────────────────────────────────────────
create table public.quiz_attempts (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete cascade,
  quiz_id        uuid not null references public.quizzes (id)  on delete cascade,
  student_id     uuid not null references public.students (id) on delete cascade,
  attempt_number smallint not null default 1 check (attempt_number between 1 and 10),
  status         public.attempt_status not null default 'in_progress',
  -- {"<question_id>": ["a"], …}
  responses      jsonb not null default '{}'::jsonb,
  score          numeric(7, 2) check (score >= 0),
  max_score      numeric(7, 2) check (max_score > 0),
  percentage     numeric(5, 2) generated always as (
    case when max_score is null or max_score = 0 or score is null then null
         else round((score / max_score) * 100, 2)
    end
  ) stored,
  started_at        timestamptz not null default now(),
  -- Server-side deadline. The client countdown is decoration; this is the rule.
  expires_at        timestamptz,
  submitted_at      timestamptz,
  graded_at         timestamptz,
  time_spent_seconds integer check (time_spent_seconds is null or time_spent_seconds >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint quiz_attempts_unique unique (quiz_id, student_id, attempt_number),
  constraint quiz_attempts_responses_are_object check (jsonb_typeof(responses) = 'object'),
  constraint quiz_attempts_submitted_has_timestamp
    check (status = 'in_progress' or submitted_at is not null)
);

create index quiz_attempts_quiz_idx    on public.quiz_attempts (quiz_id, status);
create index quiz_attempts_student_idx on public.quiz_attempts (student_id, submitted_at desc);
create index quiz_attempts_open_idx
  on public.quiz_attempts (student_id, quiz_id)
  where status = 'in_progress';

-- ── grades ─────────────────────────────────────────────────────────────────
--  The gradebook. A row here is the *published* result — assignments and
--  quizzes feed it through triggers, and a teacher can also record a manual
--  entry (an oral test, a practical) with source_type = 'manual'.
create table public.grades (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  student_id          uuid not null references public.students (id) on delete cascade,
  subject_id          uuid not null references public.subjects (id) on delete cascade,
  class_id            uuid not null references public.classes (id) on delete cascade,
  academic_session_id uuid not null references public.academic_sessions (id) on delete restrict,
  assessment_type     public.assessment_type not null default 'test',
  source_type         public.grade_source not null default 'manual',
  -- assignment_submissions.id or quiz_attempts.id. Deliberately not a foreign
  -- key: the gradebook must survive a teacher deleting the source assessment.
  source_id           uuid,
  title               text not null,
  score               numeric(7, 2) not null check (score >= 0),
  max_score           numeric(7, 2) not null check (max_score > 0),
  weight              numeric(5, 4) not null default 1 check (weight >= 0 and weight <= 1),
  percentage          numeric(5, 2) generated always as (
    round((score / max_score) * 100, 2)
  ) stored,
  -- Denormalised from schools.grading_scale at write time by
  -- app.apply_grade_band(), so a later scale change cannot rewrite history.
  letter_grade        text,
  remark              text,
  comment             text,
  recorded_by         uuid references public.teachers (id) on delete set null,
  recorded_at         timestamptz not null default now(),
  is_published        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint grades_score_within_max check (score <= max_score)
);

-- One gradebook row per source assessment; manual rows are unconstrained.
create unique index grades_one_per_source
  on public.grades (student_id, source_type, source_id)
  where source_id is not null;

create index grades_student_idx
  on public.grades (student_id, academic_session_id, subject_id);
create index grades_class_subject_idx
  on public.grades (class_id, subject_id, academic_session_id);
create index grades_published_idx
  on public.grades (student_id, academic_session_id)
  where is_published;

-- ── updated_at triggers ────────────────────────────────────────────────────
select app.attach_updated_at('public.assignments');
select app.attach_updated_at('public.assignment_submissions');
select app.attach_updated_at('public.quizzes');
select app.attach_updated_at('public.quiz_questions');
select app.attach_updated_at('public.quiz_attempts');
select app.attach_updated_at('public.grades');
