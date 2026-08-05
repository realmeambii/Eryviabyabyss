-- ═══════════════════════════════════════════════════════════════════════════
--  1000 · Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════
--  House rules:
--    • RLS is enabled on every table in `public`. There is no exception, and
--      1300 adds a regression test that fails the migration if one appears.
--    • Every policy targets `authenticated` explicitly. A policy `TO public`
--      would also match the `anon` role.
--    • Helper calls are wrapped as `(select app.x())` so the planner evaluates
--      them once per statement (InitPlan) rather than once per row.
--    • Separate policies per command. A single FOR ALL policy is convenient
--      and almost always wrong: the USING clause silently becomes the WITH
--      CHECK clause too.
--    • `service_role` holds BYPASSRLS — Edge Functions and the seed script use
--      it deliberately, and it never reaches the browser.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.schools               enable row level security;
alter table public.roles                 enable row level security;
alter table public.users                 enable row level security;
alter table public.user_roles            enable row level security;
alter table public.academic_sessions     enable row level security;
alter table public.subjects              enable row level security;
alter table public.teachers              enable row level security;
alter table public.classes               enable row level security;
alter table public.students              enable row level security;
alter table public.parents               enable row level security;
alter table public.parent_students       enable row level security;
alter table public.class_subjects        enable row level security;
alter table public.enrollments           enable row level security;
alter table public.teacher_assignments   enable row level security;
alter table public.lessons               enable row level security;
alter table public.timetable_slots       enable row level security;
alter table public.attendance_records    enable row level security;
alter table public.assignments           enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.quizzes               enable row level security;
alter table public.quiz_questions        enable row level security;
alter table public.quiz_attempts         enable row level security;
alter table public.grades                enable row level security;
alter table public.announcements         enable row level security;
alter table public.notifications         enable row level security;
alter table public.files                 enable row level security;
alter table public.audit_logs            enable row level security;

-- ═══ schools ═══════════════════════════════════════════════════════════════

create policy schools_select_members on public.schools
  for select to authenticated
  using (id = (select app.current_school_id()));

create policy schools_update_admin on public.schools
  for update to authenticated
  using (id = (select app.current_school_id()) and (select app.is_admin()))
  with check (id = (select app.current_school_id()));

-- Creating and deleting schools is a platform operation, not a tenant one:
-- no INSERT or DELETE policy exists, so only service_role can do it.

-- ═══ roles ═════════════════════════════════════════════════════════════════

create policy roles_select_all on public.roles
  for select to authenticated
  using (true);

create policy roles_insert_admin on public.roles
  for insert to authenticated
  with check ((select app.is_admin()));

-- System roles are load-bearing: handle_new_user() and every helper in 0900
-- resolve them by slug. Administrators may retune custom roles only.
create policy roles_update_admin on public.roles
  for update to authenticated
  using ((select app.is_admin()) and not is_system)
  with check ((select app.is_admin()) and not is_system);

create policy roles_delete_admin on public.roles
  for delete to authenticated
  using ((select app.is_admin()) and not is_system);

-- ═══ users ═════════════════════════════════════════════════════════════════

create policy users_select_visible on public.users
  for select to authenticated
  using ((select app.can_read_user(id)));

create policy users_insert_admin on public.users
  for insert to authenticated
  with check ((select app.is_admin()) and school_id = (select app.current_school_id()));

--  Self-service edits are further narrowed by app.protect_user_columns() in
--  1300: a user may change their name and preferences, never their school,
--  status or role.
create policy users_update_self_or_admin on public.users
  for update to authenticated
  using (
    id = (select auth.uid())
    or ((select app.is_admin()) and school_id = (select app.current_school_id()))
  )
  with check (
    id = (select auth.uid())
    or ((select app.is_admin()) and school_id = (select app.current_school_id()))
  );

create policy users_delete_admin on public.users
  for delete to authenticated
  using ((select app.is_admin()) and school_id = (select app.current_school_id()));

-- ═══ user_roles ════════════════════════════════════════════════════════════

create policy user_roles_select_self_or_admin on public.user_roles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select app.is_admin()) and school_id = (select app.current_school_id()))
  );

create policy user_roles_insert_admin on public.user_roles
  for insert to authenticated
  with check ((select app.is_admin()) and school_id = (select app.current_school_id()));

create policy user_roles_update_admin on public.user_roles
  for update to authenticated
  using ((select app.is_admin()) and school_id = (select app.current_school_id()))
  with check ((select app.is_admin()) and school_id = (select app.current_school_id()));

create policy user_roles_delete_admin on public.user_roles
  for delete to authenticated
  using ((select app.is_admin()) and school_id = (select app.current_school_id()));

-- ═══ academic_sessions · subjects · classes · class_subjects ═══════════════
--  Reference data. Readable by the whole school, writable by administrators.

create policy academic_sessions_select_school on public.academic_sessions
  for select to authenticated
  using ((select app.in_my_school(school_id)));

create policy academic_sessions_write_admin on public.academic_sessions
  for insert to authenticated
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy academic_sessions_update_admin on public.academic_sessions
  for update to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

create policy academic_sessions_delete_admin on public.academic_sessions
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy subjects_select_school on public.subjects
  for select to authenticated
  using ((select app.in_my_school(school_id)));

create policy subjects_insert_admin on public.subjects
  for insert to authenticated
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy subjects_update_admin on public.subjects
  for update to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

create policy subjects_delete_admin on public.subjects
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy classes_select_school on public.classes
  for select to authenticated
  using ((select app.in_my_school(school_id)));

create policy classes_insert_admin on public.classes
  for insert to authenticated
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy classes_update_admin on public.classes
  for update to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

create policy classes_delete_admin on public.classes
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy class_subjects_select_school on public.class_subjects
  for select to authenticated
  using ((select app.in_my_school(school_id)));

create policy class_subjects_insert_admin on public.class_subjects
  for insert to authenticated
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy class_subjects_update_admin on public.class_subjects
  for update to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

create policy class_subjects_delete_admin on public.class_subjects
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

-- ═══ teachers ══════════════════════════════════════════════════════════════
--  Staff are a directory: visible school-wide, editable by themselves (bio,
--  qualification) and by administrators.

create policy teachers_select_school on public.teachers
  for select to authenticated
  using ((select app.in_my_school(school_id)));

create policy teachers_insert_admin on public.teachers
  for insert to authenticated
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy teachers_update_self_or_admin on public.teachers
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or ((select app.is_admin()) and (select app.in_my_school(school_id)))
  )
  with check ((select app.in_my_school(school_id)));

create policy teachers_delete_admin on public.teachers
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

-- ═══ students ══════════════════════════════════════════════════════════════

create policy students_select_authorised on public.students
  for select to authenticated
  using ((select app.can_read_student(id)));

create policy students_insert_admin on public.students
  for insert to authenticated
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

--  A student may correct their own contact details; app.protect_student_columns()
--  in 1300 stops them touching admission_number, status or current_class_id.
create policy students_update_self_or_admin on public.students
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or ((select app.is_admin()) and (select app.in_my_school(school_id)))
  )
  with check ((select app.in_my_school(school_id)));

create policy students_delete_admin on public.students
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

-- ═══ parents · parent_students ═════════════════════════════════════════════

create policy parents_select_authorised on public.parents
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select app.is_admin()) and (select app.in_my_school(school_id)))
    or exists (
         select 1 from public.parent_students ps
          where ps.parent_id = parents.id
            and (select app.teaches_student(ps.student_id))
       )
  );

create policy parents_insert_admin on public.parents
  for insert to authenticated
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy parents_update_self_or_admin on public.parents
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or ((select app.is_admin()) and (select app.in_my_school(school_id)))
  )
  with check ((select app.in_my_school(school_id)));

create policy parents_delete_admin on public.parents
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy parent_students_select_authorised on public.parent_students
  for select to authenticated
  using (
    (select app.is_admin())
    or (select app.is_my_child(student_id))
    or (select app.teaches_student(student_id))
  );

create policy parent_students_insert_admin on public.parent_students
  for insert to authenticated
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy parent_students_update_admin on public.parent_students
  for update to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

create policy parent_students_delete_admin on public.parent_students
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

-- ═══ enrollments · teacher_assignments ═════════════════════════════════════

create policy enrollments_select_authorised on public.enrollments
  for select to authenticated
  using (
    (select app.can_read_student(student_id))
    or (select app.teaches_class(class_id))
  );

create policy enrollments_insert_admin on public.enrollments
  for insert to authenticated
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy enrollments_update_admin on public.enrollments
  for update to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

create policy enrollments_delete_admin on public.enrollments
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

--  Who teaches what is not a secret inside a school — students need it to know
--  whose lesson they are in.
create policy teacher_assignments_select_school on public.teacher_assignments
  for select to authenticated
  using ((select app.in_my_school(school_id)));

create policy teacher_assignments_insert_admin on public.teacher_assignments
  for insert to authenticated
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy teacher_assignments_update_admin on public.teacher_assignments
  for update to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

create policy teacher_assignments_delete_admin on public.teacher_assignments
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

-- ═══ lessons ═══════════════════════════════════════════════════════════════

create policy lessons_select_authorised on public.lessons
  for select to authenticated
  using (
    (status = 'published' and (select app.can_read_class(class_id)))
    or (select app.teaches_class_subject(class_id, subject_id))
    or (select app.is_admin())
  );

create policy lessons_insert_teacher on public.lessons
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and ((select app.teaches_class_subject(class_id, subject_id)) or (select app.is_admin()))
  );

create policy lessons_update_teacher on public.lessons
  for update to authenticated
  using ((select app.teaches_class_subject(class_id, subject_id)) or (select app.is_admin()))
  with check ((select app.in_my_school(school_id)));

create policy lessons_delete_teacher on public.lessons
  for delete to authenticated
  using ((select app.teaches_class_subject(class_id, subject_id)) or (select app.is_admin()));

-- ═══ timetable_slots ═══════════════════════════════════════════════════════

create policy timetable_select_authorised on public.timetable_slots
  for select to authenticated
  using (
    (select app.can_read_class(class_id))
    or teacher_id = (select app.current_teacher_id())
  );

create policy timetable_insert_admin on public.timetable_slots
  for insert to authenticated
  with check ((select app.is_admin()) and (select app.in_my_school(school_id)));

create policy timetable_update_admin on public.timetable_slots
  for update to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)))
  with check ((select app.in_my_school(school_id)));

create policy timetable_delete_admin on public.timetable_slots
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

-- ═══ attendance_records ════════════════════════════════════════════════════

create policy attendance_select_authorised on public.attendance_records
  for select to authenticated
  using ((select app.can_read_student(student_id)));

create policy attendance_insert_teacher on public.attendance_records
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and ((select app.teaches_class(class_id)) or (select app.is_admin()))
  );

create policy attendance_update_teacher on public.attendance_records
  for update to authenticated
  using ((select app.teaches_class(class_id)) or (select app.is_admin()))
  with check ((select app.in_my_school(school_id)));

create policy attendance_delete_admin on public.attendance_records
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

-- ═══ assignments ═══════════════════════════════════════════════════════════

create policy assignments_select_authorised on public.assignments
  for select to authenticated
  using (
    (status = 'published' and (select app.can_read_class(class_id)))
    or (select app.teaches_class_subject(class_id, subject_id))
    or (select app.is_admin())
  );

create policy assignments_insert_teacher on public.assignments
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and ((select app.teaches_class_subject(class_id, subject_id)) or (select app.is_admin()))
  );

create policy assignments_update_teacher on public.assignments
  for update to authenticated
  using ((select app.teaches_class_subject(class_id, subject_id)) or (select app.is_admin()))
  with check ((select app.in_my_school(school_id)));

create policy assignments_delete_teacher on public.assignments
  for delete to authenticated
  using ((select app.teaches_class_subject(class_id, subject_id)) or (select app.is_admin()));

-- ═══ assignment_submissions ════════════════════════════════════════════════
--  The clearest illustration of the model: a student writes only their own
--  row, only while it is still theirs to write.

create policy submissions_select_authorised on public.assignment_submissions
  for select to authenticated
  using (
    (select app.can_read_student(student_id))
    or exists (
         select 1 from public.assignments a
          where a.id = assignment_id
            and (select app.teaches_class_subject(a.class_id, a.subject_id))
       )
  );

create policy submissions_insert_own on public.assignment_submissions
  for insert to authenticated
  with check (
    student_id = (select app.current_student_id())
    and exists (
      select 1
        from public.assignments a
        join public.enrollments e
          on e.class_id = a.class_id
         and e.academic_session_id = a.academic_session_id
       where a.id = assignment_id
         and a.status = 'published'
         and e.student_id = (select app.current_student_id())
         and e.status = 'active'
    )
    -- A student cannot self-award a mark.
    and score is null
    and status in ('draft', 'submitted', 'resubmitted')
  );

--  Once graded, the row belongs to the teacher.
create policy submissions_update_own_draft on public.assignment_submissions
  for update to authenticated
  using (
    student_id = (select app.current_student_id())
    and status in ('draft', 'submitted', 'late', 'resubmitted')
  )
  with check (
    student_id = (select app.current_student_id())
    and score is null
    and status in ('draft', 'submitted', 'late', 'resubmitted')
  );

create policy submissions_update_teacher on public.assignment_submissions
  for update to authenticated
  using (
    exists (
      select 1 from public.assignments a
       where a.id = assignment_id
         and (select app.teaches_class_subject(a.class_id, a.subject_id))
    )
    or (select app.is_admin())
  )
  with check ((select app.in_my_school(school_id)));

create policy submissions_delete_own_draft on public.assignment_submissions
  for delete to authenticated
  using (
    (student_id = (select app.current_student_id()) and status = 'draft')
    or (select app.is_admin())
  );

-- ═══ quizzes ═══════════════════════════════════════════════════════════════

create policy quizzes_select_authorised on public.quizzes
  for select to authenticated
  using (
    (status = 'published' and (select app.can_read_class(class_id)))
    or (select app.teaches_class_subject(class_id, subject_id))
    or (select app.is_admin())
  );

create policy quizzes_insert_teacher on public.quizzes
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and ((select app.teaches_class_subject(class_id, subject_id)) or (select app.is_admin()))
  );

create policy quizzes_update_teacher on public.quizzes
  for update to authenticated
  using ((select app.teaches_class_subject(class_id, subject_id)) or (select app.is_admin()))
  with check ((select app.in_my_school(school_id)));

create policy quizzes_delete_teacher on public.quizzes
  for delete to authenticated
  using ((select app.teaches_class_subject(class_id, subject_id)) or (select app.is_admin()));

-- ═══ quiz_questions ════════════════════════════════════════════════════════
--  There is deliberately NO student-facing policy on this table. `options` and
--  `correct_answers` sit in the same row, and RLS cannot hide one column from
--  a reader of the other. Students receive the paper through
--  public.get_quiz_paper(), which strips the answer key server-side.

create policy quiz_questions_select_staff on public.quiz_questions
  for select to authenticated
  using (
    exists (
      select 1 from public.quizzes q
       where q.id = quiz_id
         and (select app.teaches_class_subject(q.class_id, q.subject_id))
    )
    or (select app.is_admin())
  );

create policy quiz_questions_insert_staff on public.quiz_questions
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and exists (
      select 1 from public.quizzes q
       where q.id = quiz_id
         and ((select app.teaches_class_subject(q.class_id, q.subject_id)) or (select app.is_admin()))
    )
  );

create policy quiz_questions_update_staff on public.quiz_questions
  for update to authenticated
  using (
    exists (
      select 1 from public.quizzes q
       where q.id = quiz_id
         and ((select app.teaches_class_subject(q.class_id, q.subject_id)) or (select app.is_admin()))
    )
  )
  with check ((select app.in_my_school(school_id)));

create policy quiz_questions_delete_staff on public.quiz_questions
  for delete to authenticated
  using (
    exists (
      select 1 from public.quizzes q
       where q.id = quiz_id
         and ((select app.teaches_class_subject(q.class_id, q.subject_id)) or (select app.is_admin()))
    )
  );

-- ═══ quiz_attempts ═════════════════════════════════════════════════════════
--  Students may read their own attempts but never write them directly: the
--  score would be theirs to set. start_quiz_attempt() / submit_quiz_attempt()
--  own the write path.

create policy quiz_attempts_select_authorised on public.quiz_attempts
  for select to authenticated
  using (
    (select app.can_read_student(student_id))
    or exists (
         select 1 from public.quizzes q
          where q.id = quiz_id
            and (select app.teaches_class_subject(q.class_id, q.subject_id))
       )
  );

--  Manual marking of essay questions.
create policy quiz_attempts_update_teacher on public.quiz_attempts
  for update to authenticated
  using (
    exists (
      select 1 from public.quizzes q
       where q.id = quiz_id
         and (select app.teaches_class_subject(q.class_id, q.subject_id))
    )
    or (select app.is_admin())
  )
  with check ((select app.in_my_school(school_id)));

create policy quiz_attempts_delete_admin on public.quiz_attempts
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

-- ═══ grades ════════════════════════════════════════════════════════════════

create policy grades_select_authorised on public.grades
  for select to authenticated
  using (
    -- Staff see everything for the students they are responsible for, draft or
    -- not; students and parents only see published rows.
    (select app.is_admin())
    or (select app.teaches_class_subject(class_id, subject_id))
    or (is_published and (select app.can_read_student(student_id)))
  );

create policy grades_insert_teacher on public.grades
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and ((select app.teaches_class_subject(class_id, subject_id)) or (select app.is_admin()))
  );

create policy grades_update_teacher on public.grades
  for update to authenticated
  using ((select app.teaches_class_subject(class_id, subject_id)) or (select app.is_admin()))
  with check ((select app.in_my_school(school_id)));

create policy grades_delete_admin on public.grades
  for delete to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));

-- ═══ announcements ═════════════════════════════════════════════════════════

create policy announcements_select_audience on public.announcements
  for select to authenticated
  using (
    (select app.is_admin())
    or author_id = (select auth.uid())
    or (
      status = 'published'
      and publish_at <= now()
      and (expires_at is null or expires_at > now())
      and (select app.in_my_school(school_id))
      and (
        audience = 'school'
        or (audience = 'class' and (select app.can_read_class(class_id)))
        or (audience = 'role' and exists (
              select 1 from public.user_roles ur
               where ur.user_id = (select auth.uid()) and ur.role_id = announcements.role_id))
        or (audience = 'individual' and recipient_id = (select auth.uid()))
      )
    )
  );

create policy announcements_insert_staff on public.announcements
  for insert to authenticated
  with check (
    (select app.in_my_school(school_id))
    and author_id = (select auth.uid())
    and (
      (select app.is_admin())
      -- A teacher may only address a class they actually teach.
      or (audience = 'class' and (select app.teaches_class(class_id)))
    )
  );

create policy announcements_update_author_or_admin on public.announcements
  for update to authenticated
  using (author_id = (select auth.uid()) or (select app.is_admin()))
  with check ((select app.in_my_school(school_id)));

create policy announcements_delete_author_or_admin on public.announcements
  for delete to authenticated
  using (author_id = (select auth.uid()) or (select app.is_admin()));

-- ═══ notifications ═════════════════════════════════════════════════════════
--  Strictly per-recipient. Rows are written by SECURITY DEFINER triggers and
--  by the reminder Edge Function, so no INSERT policy is needed or wanted —
--  a client cannot fabricate a notification for someone else.

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

--  Marking read/unread is the only write a recipient may make; the column
--  guard in 1300 prevents them rewriting the title or the action URL.
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ═══ files ═════════════════════════════════════════════════════════════════
--  Metadata only. The bytes are protected independently by the storage.objects
--  policies in 1100 — this table can never widen access to an object.

create policy files_select_authorised on public.files
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (select app.is_admin())
    or (visibility <> 'private' and (select app.in_my_school(school_id)))
  );

create policy files_insert_own on public.files
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select app.in_my_school(school_id))
  );

create policy files_update_owner on public.files
  for update to authenticated
  using (owner_id = (select auth.uid()) or (select app.is_admin()))
  with check ((select app.in_my_school(school_id)));

create policy files_delete_owner on public.files
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (select app.is_admin()));

-- ═══ audit_logs ════════════════════════════════════════════════════════════
--  Read-only for administrators; append-only for the database itself. The
--  absence of INSERT/UPDATE/DELETE policies is the point — 1300 also revokes
--  those privileges at the grant level, so this holds even if a policy is
--  added by mistake later.

create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using ((select app.is_admin()) and (select app.in_my_school(school_id)));
