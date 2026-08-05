-- ═══════════════════════════════════════════════════════════════════════════
--  Teacher module — the schema the portal needs and 0500/0600 did not have
-- ═══════════════════════════════════════════════════════════════════════════
--  Five additions, each backing a stated teacher capability:
--
--    quiz_questions      · validation for the two new question types
--    assignments.rubric  · "add grading rubrics"
--    lessons             · "learning objectives" and "schedule lesson"
--    question_bank_items · "use a reusable question bank"
--    student_notes       · "teacher notes" on a student profile
--
--  Nothing here widens what a teacher can reach. Every new policy resolves
--  through the same predicates the rest of the schema already uses —
--  `app.teaches_class()`, `app.teaches_student()`, `app.in_my_school()` — so a
--  teacher's scope is still exactly the classes and pupils assigned to them.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Question shapes ────────────────────────────────────────────────────────
--  The original constraint only spoke about the three option-based types;
--  anything else passed unchecked. That was fine when the alternatives were
--  short_answer and essay, which genuinely carry no answer key. The two new
--  types do carry one, and a fill-in-the-blank saved without accepted answers
--  is a question that can never be marked right.
--
--    fill_blank  correct_answers is the list of accepted strings. No options —
--                the student types a response.
--    matching    options is the list of left-hand items, correct_answers the
--                pairs. Both are needed to render or mark it.

alter table public.quiz_questions
  add constraint quiz_questions_typed_answers_are_complete check (
    question_type not in ('fill_blank', 'matching')
    or (
      correct_answers is not null
      and jsonb_array_length(correct_answers) >= 1
      and (
        question_type <> 'matching'
        or (options is not null and jsonb_array_length(options) >= 2)
      )
    )
  );

-- ── Rubrics ────────────────────────────────────────────────────────────────
--  jsonb rather than a `rubric_criteria` table: a rubric is only ever read and
--  written whole, alongside its assignment, and is never queried across
--  assignments. A child table would buy joins and referential overhead for a
--  document that has exactly one owner.
--
--  Shape: [{"id":"c1","criterion":"Working shown","points":10,"descriptor":"…"}]
--  The point total is deliberately *not* constrained to equal `max_score` —
--  teachers routinely draft a rubric before settling the mark scheme, and a
--  constraint that rejects a half-written rubric would push them out of the
--  editor.

alter table public.assignments
  add column if not exists rubric jsonb,
  add constraint assignments_rubric_is_array
    check (rubric is null or jsonb_typeof(rubric) = 'array');

comment on column public.assignments.rubric is
  'Ordered grading criteria, read and written whole with the assignment.';

-- ── Lessons: objectives and scheduling ─────────────────────────────────────
--  `status` already separates draft from published. What it cannot express is
--  "published, but not until Monday" — which is how a teacher actually works,
--  preparing a fortnight ahead. `available_from` is that: null means the moment
--  it was published.

alter table public.lessons
  add column if not exists objectives text[],
  add column if not exists available_from timestamptz;

comment on column public.lessons.objectives is
  'Learning objectives, in the order they are taught.';
comment on column public.lessons.available_from is
  'Earliest a published lesson is visible to students. Null means immediately.';

-- Students read published lessons in week order; the scheduling gate rides
-- along so the common query stays index-only.
create index if not exists lessons_available_idx
  on public.lessons (class_id, subject_id, available_from)
  where status = 'published';

-- ── question_bank_items ────────────────────────────────────────────────────
--  Reusable questions, held at school level rather than per teacher. A
--  department that writes a good Physics question bank should not have to
--  rewrite it when a colleague builds next term's test — sharing is the point
--  of a bank. Authorship is still recorded, and only the author or an
--  administrator can change an item.

create table public.question_bank_items (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools (id) on delete cascade,
  subject_id      uuid not null references public.subjects (id) on delete cascade,
  -- Keep the question if its author leaves the school.
  created_by      uuid references public.teachers (id) on delete set null,
  question_type   public.question_type not null default 'multiple_choice',
  prompt          text not null check (length(btrim(prompt)) > 0),
  options         jsonb,
  correct_answers jsonb,
  points          numeric(6, 2) not null default 1 check (points > 0),
  explanation     text,
  -- Free-form labels — "mechanics", "waec", "hard". Searched with an array
  -- containment operator, backed by the GIN index below.
  tags            text[] not null default '{}',
  -- Which class level this suits (1..6 for JSS1..SS3), when it is level-specific.
  level           smallint check (level is null or level between 1 and 6),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint question_bank_options_are_array
    check (options is null or jsonb_typeof(options) = 'array'),
  constraint question_bank_answers_are_array
    check (correct_answers is null or jsonb_typeof(correct_answers) = 'array'),
  -- The same completeness rule quiz_questions enforces. A bank item that
  -- cannot be marked is worse than no bank item: it looks usable until it is
  -- copied into a live paper.
  constraint question_bank_objective_is_complete check (
    question_type not in ('multiple_choice', 'multiple_select', 'true_false', 'matching')
    or (options is not null and jsonb_array_length(options) >= 2
        and correct_answers is not null and jsonb_array_length(correct_answers) >= 1)
  ),
  constraint question_bank_typed_answers_are_complete check (
    question_type <> 'fill_blank'
    or (correct_answers is not null and jsonb_array_length(correct_answers) >= 1)
  )
);

create index question_bank_subject_idx on public.question_bank_items (subject_id, created_at desc);
create index question_bank_school_idx  on public.question_bank_items (school_id);
create index question_bank_tags_idx    on public.question_bank_items using gin (tags);
-- The bank browser searches prompts; trigram beats a leading-wildcard LIKE scan.
create index question_bank_prompt_trgm_idx
  on public.question_bank_items using gin (prompt extensions.gin_trgm_ops);

comment on table public.question_bank_items is
  'Reusable questions, shared school-wide. Copied into quiz_questions rather '
  'than referenced, so editing a bank item never rewrites a paper already sat.';

-- ── student_notes ──────────────────────────────────────────────────────────
--  A teacher's running observations about a pupil. Explicitly *not* part of
--  `students`, which is administrative and which teachers must not edit.
--
--  `is_private` decides whether colleagues teaching the same pupil can read it.
--  Both settings are visible to administrators — a note about a child is a
--  safeguarding record, and there is no version of this table where the school
--  cannot see what its staff wrote about a pupil.

create table public.student_notes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id)  on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  -- The note outlives the author's employment; it is the school's record.
  teacher_id  uuid references public.teachers (id) on delete set null,
  subject_id  uuid references public.subjects (id) on delete set null,
  body        text not null check (length(btrim(body)) between 1 and 4000),
  -- Visible to the author and administrators only.
  is_private  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index student_notes_student_idx on public.student_notes (student_id, created_at desc);
create index student_notes_teacher_idx on public.student_notes (teacher_id, created_at desc);

comment on table public.student_notes is
  'Teacher observations about a pupil. Never shown to the student or their '
  'guardians — there is no policy granting either of them SELECT.';

select app.attach_updated_at('public.question_bank_items');
select app.attach_updated_at('public.student_notes');

-- ── Row Level Security ─────────────────────────────────────────────────────
--  1300 asserts that every table in `public` has RLS enabled and at least one
--  policy. These two would fail that assertion without what follows.

alter table public.question_bank_items enable row level security;
alter table public.student_notes       enable row level security;

-- Question bank: readable by any member of staff in the school, writable by
-- the author. Students have no policy at all — the bank holds answer keys.
create policy question_bank_select_staff on public.question_bank_items
  for select to authenticated
  using (
    (select app.in_my_school(school_id))
    and ((select app.is_teacher()) or (select app.is_admin()))
  );

create policy question_bank_insert_staff on public.question_bank_items
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and ((select app.is_teacher()) or (select app.is_admin()))
  );

create policy question_bank_update_author on public.question_bank_items
  for update to authenticated
  using (
    (select app.in_my_school(school_id))
    and (created_by = (select app.current_teacher_id()) or (select app.is_admin()))
  )
  with check ((select app.in_my_school(school_id)));

create policy question_bank_delete_author on public.question_bank_items
  for delete to authenticated
  using (
    (select app.in_my_school(school_id))
    and (created_by = (select app.current_teacher_id()) or (select app.is_admin()))
  );

-- Notes: the author always; colleagues who teach the pupil unless the note is
-- private; administrators regardless. `app.teaches_student()` is the same
-- predicate that gates every other teacher-side read.
create policy student_notes_select_staff on public.student_notes
  for select to authenticated
  using (
    (select app.is_admin())
    or teacher_id = (select app.current_teacher_id())
    or (not is_private and (select app.teaches_student(student_id)))
  );

create policy student_notes_insert_teacher on public.student_notes
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and teacher_id = (select app.current_teacher_id())
    and (select app.teaches_student(student_id))
  );

-- Only the author may rewrite their own observation. An administrator can read
-- and remove a note but not put words in a teacher's mouth.
create policy student_notes_update_author on public.student_notes
  for update to authenticated
  using (teacher_id = (select app.current_teacher_id()))
  with check (
    teacher_id = (select app.current_teacher_id())
    and (select app.in_my_school(school_id))
  );

create policy student_notes_delete_author_or_admin on public.student_notes
  for delete to authenticated
  using (
    teacher_id = (select app.current_teacher_id())
    or ((select app.is_admin()) and (select app.in_my_school(school_id)))
  );

-- ── Privileges ─────────────────────────────────────────────────────────────
--  The grant loop in 1300 ran long before these tables existed. Without this a
--  policy-perfect table still answers "permission denied for table", because
--  the privilege check happens before RLS is ever consulted.

grant select, insert, update, delete
  on public.question_bank_items, public.student_notes
  to authenticated, service_role;

revoke all on public.question_bank_items, public.student_notes from anon;
