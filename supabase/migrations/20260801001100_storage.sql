-- ═══════════════════════════════════════════════════════════════════════════
--  1100 · Storage buckets and object policies
-- ═══════════════════════════════════════════════════════════════════════════
--  Every bucket has a fixed path grammar, and the policies below read the
--  path segments as the access key. Getting the grammar right on upload is
--  therefore a security requirement, not a tidiness one — see
--  src/shared/services/storage.service.ts, which is the only place in the
--  frontend that builds these paths.
--
--    profile-photos     {user_id}/{filename}
--    school-logos       {school_id}/{filename}
--    assignment-uploads {school_id}/{assignment_id}/{student_id|'brief'}/{filename}
--    lesson-materials   {school_id}/{class_id}/{lesson_id}/{filename}
--    student-documents  {school_id}/{student_id}/{filename}
--
--  Only the two low-sensitivity buckets are public. Everything else is served
--  through short-lived signed URLs.
-- ═══════════════════════════════════════════════════════════════════════════

-- A malformed path must fail closed, not raise 22P02 out of a policy.
create or replace function app.as_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function app.as_uuid(text) to authenticated, anon, service_role;

-- ── Buckets ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-photos', 'profile-photos', true, 2 * 1024 * 1024,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),

  ('school-logos', 'school-logos', true, 2 * 1024 * 1024,
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),

  ('assignment-uploads', 'assignment-uploads', false, 25 * 1024 * 1024,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv',
      'image/jpeg', 'image/png', 'image/webp', 'image/heic',
      'application/zip'
    ]),

  ('lesson-materials', 'lesson-materials', false, 100 * 1024 * 1024,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/markdown',
      'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4'
    ]),

  ('student-documents', 'student-documents', false, 15 * 1024 * 1024,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ═══ profile-photos ════════════════════════════════════════════════════════
--  Public bucket: the object URL is guessable-but-unlisted, which is the usual
--  trade for avatars. Writes are locked to the owner's own folder.

create policy "profile photos are readable"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'profile-photos');

create policy "users manage their own profile photo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users update their own profile photo"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users delete their own profile photo"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ═══ school-logos ══════════════════════════════════════════════════════════

create policy "school logos are readable"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'school-logos');

create policy "administrators manage school logos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'school-logos'
    and (select app.is_admin())
    and (select app.in_my_school(app.as_uuid((storage.foldername(name))[1])))
  );

create policy "administrators update school logos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'school-logos'
    and (select app.is_admin())
    and (select app.in_my_school(app.as_uuid((storage.foldername(name))[1])))
  )
  with check (bucket_id = 'school-logos');

create policy "administrators delete school logos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'school-logos'
    and (select app.is_admin())
    and (select app.in_my_school(app.as_uuid((storage.foldername(name))[1])))
  );

-- ═══ assignment-uploads ════════════════════════════════════════════════════
--  {school_id}/{assignment_id}/{student_id | 'brief'}/{filename}
--  The third segment decides who owns the object: a student's own work, or the
--  teacher's brief which the whole class may read.

create policy "assignment uploads are readable by the people involved"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'assignment-uploads'
    and (select app.in_my_school(app.as_uuid((storage.foldername(name))[1])))
    and (
      owner_id = (select auth.uid())::text
      or (select app.is_admin())
      -- The teacher who set the work.
      or exists (
           select 1 from public.assignments a
            where a.id = app.as_uuid((storage.foldername(name))[2])
              and (select app.teaches_class_subject(a.class_id, a.subject_id))
         )
      -- The brief and its attachments — visible to the whole class.
      or (
        (storage.foldername(name))[3] = 'brief'
        and exists (
          select 1 from public.assignments a
           where a.id = app.as_uuid((storage.foldername(name))[2])
             and a.status = 'published'
             and (select app.can_read_class(a.class_id))
        )
      )
      -- The student's own submission, and their guardians'.
      or (select app.can_read_student(app.as_uuid((storage.foldername(name))[3])))
    )
  );

create policy "students upload their own assignment work"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'assignment-uploads'
    and (select app.in_my_school(app.as_uuid((storage.foldername(name))[1])))
    and (
      -- A student writes only into their own folder, for a published
      -- assignment belonging to a class they are enrolled in.
      (
        (storage.foldername(name))[3] = (select app.current_student_id())::text
        and exists (
          select 1
            from public.assignments a
            join public.enrollments e
              on e.class_id = a.class_id
             and e.academic_session_id = a.academic_session_id
           where a.id = app.as_uuid((storage.foldername(name))[2])
             and a.status = 'published'
             and e.student_id = (select app.current_student_id())
             and e.status = 'active'
        )
      )
      -- A teacher writes the brief.
      or (
        (storage.foldername(name))[3] = 'brief'
        and exists (
          select 1 from public.assignments a
           where a.id = app.as_uuid((storage.foldername(name))[2])
             and (select app.teaches_class_subject(a.class_id, a.subject_id))
        )
      )
      or (select app.is_admin())
    )
  );

create policy "assignment uploads are updatable by their owner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'assignment-uploads'
    and (owner_id = (select auth.uid())::text or (select app.is_admin()))
  )
  with check (bucket_id = 'assignment-uploads');

create policy "assignment uploads are deletable by their owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'assignment-uploads'
    and (owner_id = (select auth.uid())::text or (select app.is_admin()))
  );

-- ═══ lesson-materials ══════════════════════════════════════════════════════
--  {school_id}/{class_id}/{lesson_id}/{filename}

create policy "lesson materials are readable by the class"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'lesson-materials'
    and (select app.in_my_school(app.as_uuid((storage.foldername(name))[1])))
    and (select app.can_read_class(app.as_uuid((storage.foldername(name))[2])))
  );

create policy "teachers upload lesson materials"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'lesson-materials'
    and (select app.in_my_school(app.as_uuid((storage.foldername(name))[1])))
    and (
      (select app.teaches_class(app.as_uuid((storage.foldername(name))[2])))
      or (select app.is_admin())
    )
  );

create policy "teachers update lesson materials"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'lesson-materials'
    and (
      (select app.teaches_class(app.as_uuid((storage.foldername(name))[2])))
      or (select app.is_admin())
    )
  )
  with check (bucket_id = 'lesson-materials');

create policy "teachers delete lesson materials"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'lesson-materials'
    and (
      (select app.teaches_class(app.as_uuid((storage.foldername(name))[2])))
      or (select app.is_admin())
    )
  );

-- ═══ student-documents ═════════════════════════════════════════════════════
--  {school_id}/{student_id}/{filename}
--  Birth certificates, medical letters, transfer records. The tightest bucket:
--  read follows app.can_read_student(), writes are administrator-only.

create policy "student documents are readable by the people responsible"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'student-documents'
    and (select app.in_my_school(app.as_uuid((storage.foldername(name))[1])))
    and (select app.can_read_student(app.as_uuid((storage.foldername(name))[2])))
  );

create policy "administrators upload student documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'student-documents'
    and (select app.is_admin())
    and (select app.in_my_school(app.as_uuid((storage.foldername(name))[1])))
  );

create policy "administrators update student documents"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'student-documents' and (select app.is_admin()))
  with check (bucket_id = 'student-documents');

create policy "administrators delete student documents"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'student-documents' and (select app.is_admin()));
