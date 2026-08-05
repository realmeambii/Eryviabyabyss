# Row Level Security

RLS is the authorisation boundary of this system. Everything else — route
guards, conditional rendering, disabled buttons — is presentation.

Migrations `0900` (helpers), `1000` (policies) and `1300` (hardening).

---

## House rules

1. **RLS is enabled on every table in `public`.** No exceptions. `1300` ends
   with an assertion that fails the migration if a table ships without it, and
   a second that fails if a table has RLS on but no policy at all.

2. **Every policy targets `authenticated` explicitly.** A policy written
   `TO public` also matches the `anon` role — which is every unauthenticated
   visitor on the internet.

3. **Separate policies per command.** A single `FOR ALL` policy is convenient
   and almost always wrong: its `USING` clause silently becomes the
   `WITH CHECK` clause too, so a read rule quietly becomes a write rule.

4. **Helper calls are wrapped as `(select app.x())`.** That makes Postgres
   hoist the call into an InitPlan, evaluated once per statement instead of
   once per row — the difference between one lookup and 200 000 of them on a
   large scan.

5. **`service_role` holds `BYPASSRLS`.** Edge Functions and the seed use it
   deliberately. It never reaches the browser.

---

## Helper functions

All in the `app` schema, which is **not** in the PostgREST exposed-schema list,
so no client can call them directly.

| Function | Answers |
| --- | --- |
| `app.current_school_id()` | Which school am I in? |
| `app.has_role(slug)` | Do I hold this role? |
| `app.is_admin()` / `is_teacher()` / `is_student()` / `is_parent()` | Shorthands |
| `app.current_student_id()` / `current_teacher_id()` / `current_parent_id()` | My role-extension id |
| `app.in_my_school(school_id)` | Is this row in my school? |
| `app.teaches_class(class_id)` | Do I teach this class — or am I its form teacher? |
| `app.teaches_class_subject(class, subject)` | Do I teach this pairing? |
| `app.teaches_student(student_id)` | Is this student in a class I teach? |
| `app.is_my_child(student_id)` / `app.my_children()` | Parent scope |
| `app.is_enrolled_in(class_id)` | Am I a student in this class? |
| `app.can_read_class(class_id)` | Composite: admin, teacher, enrolled student, or parent of one |
| `app.can_read_student(student_id)` | Composite: admin, self, guardian, or teacher |
| `app.can_read_user(user_id)` | Profile visibility |

### Why they are `SECURITY DEFINER`

A policy on `user_roles` that queries `user_roles` recurses forever. Running
the lookup as the table owner — which bypasses RLS — breaks the cycle.

That is safe here because **every one of these functions is a boolean question
about the caller.** None returns another user's data. `app.teaches_student(x)`
answers "do I teach x", not "who teaches x".

### Why `search_path = ''`

A `SECURITY DEFINER` function that resolves `users` through the *caller's*
`search_path` can be pointed at an attacker-created table of the same name.
Every identifier in `0900` is schema-qualified and the path is pinned empty.

### Why `STABLE`

It lets the planner evaluate them once per statement rather than once per row.
Combined with rule 4 above, this is the difference between a policy that scales
and one that doesn't.

---

## The access model

### Administrator

Everything within their own school:

```sql
(select app.is_admin()) and (select app.in_my_school(school_id))
```

The second half matters. Without it, an administrator of School A could read
School B — administrators are scoped, not global.

### Teacher

Scoped by `teacher_assignments` — which classes and subjects they were given
this term — plus the classes where they are the form teacher.

```sql
create policy assignments_select_authorised on public.assignments
  for select to authenticated
  using (
    (status = 'published' and (select app.can_read_class(class_id)))
    or (select app.teaches_class_subject(class_id, subject_id))
    or (select app.is_admin())
  );
```

A teacher sees their own drafts (second clause) and any published assignment
for a class they can read. A student only ever matches the first clause, so
drafts are invisible to them — which is what "draft" has to mean.

Note `app.teaches_class()` also returns true for a form teacher. A form teacher
owns their whole class, not only the subjects they personally take.

### Student

Their own records, and the published content of classes they are enrolled in.

The submissions policies are the clearest illustration:

```sql
create policy submissions_insert_own on public.assignment_submissions
  for insert to authenticated
  with check (
    student_id = (select app.current_student_id())
    and exists ( … enrolled in the class, assignment published … )
    and score is null                                   -- ← no self-marking
    and status in ('draft', 'submitted', 'resubmitted')
  );

create policy submissions_update_own_draft on public.assignment_submissions
  for update to authenticated
  using (
    student_id = (select app.current_student_id())
    and status in ('draft', 'submitted', 'late', 'resubmitted')
  )
  with check ( … and score is null … );
```

Three separate guarantees: you write only your own row, only for work actually
set to your class, and **never with a score**. Once the row reaches `graded` it
no longer matches the `USING` clause, so it stops being the student's to edit.

### Parent

Everything resolves through `parent_students`:

```sql
create policy attendance_select_authorised on public.attendance_records
  for select to authenticated
  using ((select app.can_read_student(student_id)));
```

One predicate serves all four roles — admin, self, guardian, teacher — which is
why `can_read_student()` is worth having as a composite.

---

## Two cases worth studying

### The quiz answer key

`quiz_questions.correct_answers` sits in the same row as `options`. RLS is
row-level: **it cannot hide one column from a reader of the other.**

So students have **no SELECT policy on `quiz_questions` at all**. They receive
the paper through `public.get_quiz_paper()`, a `SECURITY DEFINER` function that
returns prompt, options and marks — and drops the key. Marking happens in
`submit_quiz_attempt()`, server-side.

For the same reason students have no INSERT or UPDATE policy on
`quiz_attempts`. A client that could write that row could write its own score.

This is the honest answer to "can I just add a policy?" — sometimes the shape
of the data means no, and the operation has to move into a function.

### Column-level writes

RLS decides *which rows* you may write. It says nothing about *which columns*.

A student legitimately needs UPDATE on their own `users` row to fix their
phone number. That same permission would let them set `school_id`, `status`, or
their own `email`.

Column privileges (`GRANT UPDATE (col) …`) do not help: administrators are also
`authenticated`, so revoking the column from the role revokes it from everyone.

`1300` closes the gap with guard triggers that silently restore protected
columns:

```sql
create or replace function app.protect_user_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or app.is_admin() then
    return new;                        -- service role, or an administrator
  end if;
  new.school_id  := old.school_id;
  new.status     := old.status;
  new.email      := old.email;         -- email changes go through Auth
  new.metadata   := old.metadata;
  new.created_at := old.created_at;
  return new;
end;
$$;
```

The same pattern protects `students` (admission number, class, status),
`notifications` (everything but `is_read`) and `grades` (the source pointer, so
a mark cannot be re-attributed to a different assessment).

The `auth.uid() is null` escape hatch is what lets the service role, the seed
and the auth triggers through — none of them should be second-guessed.

---

## Append-only audit

`audit_logs` gets a SELECT policy and nothing else. `1300` *also* revokes
INSERT, UPDATE, DELETE and TRUNCATE at the grant level.

Both are needed. A write requires **both a policy and a privilege**, so the
table stays append-only even if somebody adds a policy by mistake later.

---

## Realtime

Realtime applies the same policies as a SELECT: a subscriber receives a change
only if the row would have been visible to them anyway.

The publication list in `1200` is therefore a **performance** decision, not a
security one — it controls how much write traffic is broadcast. `audit_logs`,
`users` and `quiz_questions` are deliberately excluded.

The `filter` argument in `useRealtime` is likewise a bandwidth optimisation.
Dropping it would not leak anything; it would just ship more messages.

---

## Testing policies

### By hand, in psql

Impersonate a user by setting the same claims PostgREST would:

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"<user-uuid>","role":"authenticated"}';

  select count(*) from students;   -- admin: 200 · teacher: ~their classes · student: 1
  select count(*) from grades;
rollback;
```

Run it once per seeded role. The counts changing while the query stays
identical is the whole model in one screen.

### In the app

Sign in as each seeded account and open `/admin/students` (or force the URL).
The administrator sees 200; the teacher sees only their own students; the
parent sees their children.

### Schema linter

```bash
npm run db:lint
```

Flags missing indexes on RLS-referenced foreign keys, functions with mutable
`search_path`, and policies that will not use an index.

---

## Adding a table

1. Create it with `school_id` and the right cascade rules.
2. `alter table … enable row level security;`
3. Write **four separate policies** — select, insert, update, delete — each
   `TO authenticated`.
4. Wrap every helper call as `(select app.x())`.
5. Index whatever the policies filter on.
6. If a column must not be client-writable, add a guard trigger in `1300`.
7. Run `npm run db:reset` — the assertions at the end of `1300` will fail the
   migration if you forgot step 2 or step 3.
