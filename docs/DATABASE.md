# Database

PostgreSQL 17 on Supabase. 27 tables, 22 enums, 18 trigger functions, 5 RPCs,
~90 RLS policies.

## Migrations

Numbered by concern, not by date-of-change, so reading them in order is reading
the system from the ground up.

| File | Contents |
| --- | --- |
| `0100_extensions_and_schemas` | `pgcrypto`, `btree_gist`, `pg_trgm`; the `app` schema; `updated_at` helper |
| `0200_enums` | 22 domain enums |
| `0300_core_tables` | `schools`, `roles`, `users`, `user_roles`, `academic_sessions` |
| `0400_people_and_structure` | `subjects`, `teachers`, `classes`, `students`, `parents`, `parent_students`, `class_subjects`, `enrollments`, `teacher_assignments` |
| `0500_lessons_timetable_attendance` | `lessons`, `timetable_slots` (the migration also created `attendance_records`, dropped in `20260805000300_remove_attendance`) |
| `0600_assessments` | `assignments`, `assignment_submissions`, `quizzes`, `quiz_questions`, `quiz_attempts`, `grades` |
| `0700_communication_and_audit` | `announcements`, `notifications`, `files`, `audit_logs` |
| `0800_functions_and_triggers` | Business rules: lateness, grade banding, gradebook sync, notification fan-out, audit trail |
| `0900_rls_helpers` | `app.*` predicate functions |
| `1000_rls_policies` | RLS enabled + every policy |
| `1050_rpc` | The four public RPCs |
| `1100_storage` | Buckets and `storage.objects` policies |
| `1200_realtime` | Publication membership |
| `1300_hardening` | Column guards, REVOKEs, resource limits, assertions |

Migrations are **forward-only**. Once applied to any shared environment, a
migration is never edited — the next change is a new file. Editing an applied
migration means the local database and production silently disagree about what
"migrated" means.

---

## Model

### Tenancy

`schools` is the root. Nearly every table carries `school_id`, even where it
could be derived through a join.

That denormalisation is deliberate. RLS predicates run on every row of every
query; `app.in_my_school(school_id)` is one indexed comparison, where a join
chain back to `schools` would be several. It also means a mis-joined row cannot
silently cross a tenant boundary — the column would have to be wrong, not just
the join.

### Identity

```
auth.users            Supabase Auth. Credentials live here and nowhere else.
    │ 1:1 (id, ON DELETE CASCADE)
public.users          The profile. Name, contact, preferences, status.
    │
    ├── user_roles ── roles          many-to-many, scoped to a school
    ├── students                     1:1 extension
    ├── teachers                     1:1 extension
    └── parents                      1:1 extension
```

`students`, `teachers` and `parents` are **profile extensions, not separate
identities**. Each holds exactly one `user_id` and adds the fields that only
make sense for that role. Someone who teaches at the school and also has a
child there gets one `users` row, two role grants and two extension rows — not
two accounts.

`roles` is a table rather than an enum so a school can add "Bursar" or "Head of
Department" in Phase 2 without a migration. The four system roles are marked
`is_system` and cannot be edited or deleted, because `handle_new_user()` and
every helper in `0900` resolve them by slug.

### Academic structure

```
academic_sessions       one row per TERM  ("2025/2026", 'second')
    ├── classes         JSS 1 A · level 1 · form teacher
    │     ├── class_subjects      ── subjects
    │     ├── enrollments         ── students
    │     └── teacher_assignments ── teachers × subjects
    └── …
```

An `academic_sessions` row is a *term*, not a year: `("2025/2026", 'first')`
and `("2025/2026", 'second')` are separate rows. Everything academic is scoped
to one, so last term stays queryable and immutable while this term changes. At
most one may be current per school — a partial unique index enforces it rather
than a convention.

`students.current_class_id` is a cache of "the class this student sits in right
now". The authoritative history is `enrollments`; the cache exists so the hot
path ("what is my timetable?") does not need a session join, and is maintained
by `app.sync_current_class()`.

### `parent_students`

Not in the original table list, but unavoidable. "Parents only access their
children's records" is a many-to-many relationship: siblings share a guardian,
and a child has two. Every parent-side policy resolves through this table via
`app.is_my_child()`.

Exactly one primary contact per student, enforced by a partial unique index.

### Assessment

```
assignments ──< assignment_submissions ──┐
                                          ├──> grades
quizzes ──< quiz_questions                │
        └──< quiz_attempts ───────────────┘
```

`grades` is the published record. Assignment and quiz marks arrive there
through triggers, not a second client write, so a mark and its gradebook entry
cannot disagree. A teacher can also record a manual entry — an oral test, a
practical — with `source_type = 'manual'`.

`grades.source_id` deliberately has **no foreign key**. The gradebook must
survive a teacher deleting the assignment behind a mark that has already gone
out on a report card. A partial unique index on
`(student_id, source_type, source_id) WHERE source_id IS NOT NULL` keeps
re-grading idempotent while leaving manual rows unconstrained.

`grades.letter_grade` is denormalised from `schools.grading_scale` at write
time by `app.apply_grade_band()`. Re-tuning the scale next year must not
silently rewrite last year's reports.

### Timetable

`timetable_slots` carries a generated column:

```sql
period int4range generated always as (
  int4range(
    (date_part('epoch', starts_at) / 60)::int,
    (date_part('epoch', ends_at)   / 60)::int
  )
) stored
```

— the slot as minutes-from-midnight, so GiST can test it for overlap. Two
`EXCLUDE` constraints then make clashes **impossible to insert**:

```sql
constraint timetable_slots_no_class_clash exclude using gist (
  class_id extensions.gist_uuid_ops with =, …, period with && )

constraint timetable_slots_no_teacher_clash exclude using gist (
  teacher_id extensions.gist_uuid_ops with =, …, period with && )
  where (teacher_id is not null and is_break = false)
```

A double-booked teacher is a data error, not a UI concern. A clash comes back
as SQLSTATE `23P01`, which `toAppError()` renders as "That slot clashes with an
existing one" — so no client has to run its own overlap check, and none can
forget to.

### Audit

`audit_logs` is append-only, twice over: `1000` gives it a SELECT policy and
nothing else, and `1300` also revokes INSERT/UPDATE/DELETE at the grant level.
Both are needed — a write requires *both* a policy and a privilege, so the
table stays append-only even if a policy is added by mistake later.

`app.audit_row()` strips `medical_notes`, `metadata`, `responses` and
`correct_answers` before writing, and skips updates that only bumped
`updated_at`.

---

## Conventions

**UUID primary keys** throughout, `gen_random_uuid()` by default. Ids are
exposed in URLs; sequential integers would leak enrolment numbers and invite
enumeration.

**Cascades follow ownership.**

| Rule | Applied to |
| --- | --- |
| `ON DELETE CASCADE` | Children that cannot outlive their parent — submissions of an assignment, questions of a quiz, role grants of a user |
| `ON DELETE RESTRICT` | References that must block deletion — a subject with assignments, a session with classes |
| `ON DELETE SET NULL` | Optional references that survive — `created_by` when a teacher leaves, `form_teacher_id` when a class loses one |

Deleting a teacher must not delete the assignments they set. Deleting a
*student* does remove their submissions — that is what "erase this pupil's
record" means, and it is what GDPR-style deletion requires.

**Timestamps.** `created_at` and `updated_at` (`timestamptz`, default `now()`)
on every mutable table. `updated_at` is maintained by a trigger, never by the
client — a client-supplied timestamp is a client-controlled timestamp.

**Constraints over conventions.** If a rule can be a `CHECK`, a partial unique
index or an `EXCLUDE`, it is one. Examples in the schema:

- one active enrolment per student per term
- one lead teacher per class + subject + term
- exactly one current term per school
- exactly one primary contact per student
- `announcements`: the target column matching the audience
- `quiz_questions`: objective questions must ship options *and* an answer key
- `grades`: `score <= max_score`

**Indexes** cover the foreign keys RLS traverses and the queries the UI runs.
Several are partial or covering where that removes a heap fetch from a hot
predicate — `teacher_assignments_rls_idx` and `enrollments_active_lookup_idx`
exist specifically for `app.teaches_class()` and `app.teaches_student()`.

---

## Business rules in the database

Everything in `0800`. The test for whether a rule belongs here: **could a
client that skips the UI break it?** If yes, it is not the UI's job.

| Trigger | Rule |
| --- | --- |
| `handle_new_user` | Creates profile, grants a role, creates the role-extension row |
| `sync_user_full_name` | Maintains `full_name`; normalises email casing |
| `sync_current_class` | Keeps `students.current_class_id` in step with enrolment |
| `enforce_submission_rules` | Lateness from the **database clock**; window and score checks |
| `apply_grade_band` | Bands the percentage against the school's scale and freezes it |
| `sync_grade_from_submission` | Graded submission → gradebook row |
| `sync_grade_from_quiz_attempt` | Graded attempt → gradebook row |
| `recalc_quiz_total_points` | Keeps `quizzes.total_points` equal to the sum of its questions |
| `notify_class_on_publish` | Publishing an assignment or quiz notifies the class |
| `notify_on_submission_graded` | Notifies the student and their primary contact |
| `notify_on_announcement_published` | Fans out to the announcement's audience |
| `stamp_notification_read` | Keeps `read_at` honest |
| `audit_row` | Writes the trail for users, roles, enrolments, grades, submissions |

### Privilege escalation at sign-up

`handle_new_user()` reads the role from **`raw_app_meta_data` first**, and only
falls back to `raw_user_meta_data`.

That ordering is the whole security control. `raw_user_meta_data` is whatever
the browser passed to `supabase.auth.signUp({ options: { data } })` — entirely
attacker-controlled. `raw_app_meta_data` can only be set with the service-role
key. So a self-service sign-up can reach `student` or `parent` and nothing
else; `teacher` and `administrator` must be provisioned server-side.

---

## RPCs

Only four functions are exposed, each because the operation cannot be expressed
safely as a table read or write.

| Function | Why it exists |
| --- | --- |
| `current_user_context()` | One round trip for the app bootstrap instead of six |
| `get_quiz_paper(quiz_id)` | Must return questions **without** the answer key |
| `start_quiz_attempt(quiz_id)` | Enforces the attempt limit; sets a server-side deadline |
| `submit_quiz_attempt(id, responses)` | Marks the paper. A client that could write its own score would not be an assessment system |
| `mark_all_notifications_read()` | One statement instead of N round trips |

The quiz functions are the clearest case. `quiz_questions.correct_answers` sits
in the same row as `options`, and RLS is row-level — it cannot hide one column
from a reader of the other. So students have **no SELECT policy on that table
at all**, and receive the paper through a SECURITY DEFINER function that strips
the key.

Everything else — assignments, grades, lessons — is plain table access under
RLS. Wrapping those in RPCs would only move the security boundary somewhere
harder to audit.

---

## Storage

Five buckets. Each has a fixed path grammar, and the policies read access
rights out of the path segments.

| Bucket | Public | Limit | Path |
| --- | --- | --- | --- |
| `profile-photos` | ✅ | 2 MB | `{user_id}/{file}` |
| `school-logos` | ✅ | 2 MB | `{school_id}/{file}` |
| `assignment-uploads` | ❌ | 25 MB | `{school_id}/{assignment_id}/{student_id\|brief}/{file}` |
| `lesson-materials` | ❌ | 100 MB | `{school_id}/{class_id}/{lesson_id}/{file}` |
| `student-documents` | ❌ | 15 MB | `{school_id}/{student_id}/{file}` |

Because the path *is* the access key, building one correctly is a security
requirement rather than a tidiness one. `src/shared/services/storage.service.ts`
is the only module in the frontend that constructs a path, and every upload
goes through it.

`public.files` indexes the objects so they are queryable ("every attachment on
assignment X") and carries owner and visibility. It can never widen access:
the bytes are protected independently by the `storage.objects` policies.

---

## Seeds

`supabase/seed/seed.sql`, run by `npm run db:reset`.

1 school · 3 terms · 20 subjects · 10 classes · 5 administrators · 20 teachers ·
200 students · 150 parents · ~90 class-subjects · ~300 timetable slots ·
~80 assignments · ~800 graded submissions · 20 quizzes · ~150 attempts ·
8 announcements.

Password for every account: `Password123!`

Two things worth knowing about how it works:

**Accounts are created by inserting into `auth.users`**, which fires
`handle_new_user()`. The seed therefore exercises the real sign-up path rather
than working around it — and if that trigger breaks, `db:reset` fails loudly.

**The triggers are left on.** Publishing 80 assignments fans out ~1 600
notifications; grading 800 submissions writes 800 gradebook rows and ~1 600
more notifications; all of it lands in `audit_logs`. A seed that bypassed the
triggers would not prove they work.

The timetable loop is the one place the seed catches an exception on purpose:
it tries each subject's own lead teacher first and falls back to leaving the
slot unassigned when that teacher is already busy in the period. That is the
`EXCLUDE` constraint doing its job, not a workaround.
