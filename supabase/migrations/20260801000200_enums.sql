-- ═══════════════════════════════════════════════════════════════════════════
--  0200 · Domain enums
-- ═══════════════════════════════════════════════════════════════════════════
--  Enums are used where the value set is closed and owned by the product
--  (a submission is graded or it is not). Anything the *school* should be able
--  to extend at runtime — roles, subjects, grade bands — is a table instead.
--
--  Adding a value later:  alter type public.<name> add value 'x';
--  (Postgres allows appending; it does not allow removing. Choose carefully.)
-- ═══════════════════════════════════════════════════════════════════════════

create type public.gender as enum ('male', 'female', 'other', 'undisclosed');

create type public.user_status as enum ('invited', 'active', 'suspended', 'archived');

create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'visiting');

create type public.student_status as enum (
  'active', 'graduated', 'transferred', 'withdrawn', 'suspended'
);

create type public.guardian_relationship as enum (
  'father', 'mother', 'guardian', 'sibling', 'other'
);

create type public.academic_term as enum ('first', 'second', 'third');

create type public.enrollment_status as enum (
  'active', 'completed', 'transferred', 'withdrawn', 'repeating'
);

-- Shared lifecycle for teacher-authored content (lessons, assignments,
-- quizzes, announcements).
create type public.publication_status as enum ('draft', 'published', 'closed', 'archived');

create type public.assessment_type as enum (
  'homework', 'classwork', 'assignment', 'test', 'quiz', 'project', 'exam'
);

create type public.submission_status as enum (
  'draft', 'submitted', 'late', 'graded', 'returned', 'resubmitted', 'missing'
);

create type public.question_type as enum (
  'multiple_choice', 'multiple_select', 'true_false', 'short_answer', 'essay'
);

create type public.attempt_status as enum (
  'in_progress', 'submitted', 'graded', 'abandoned', 'expired'
);

create type public.grade_source as enum ('assignment', 'quiz', 'manual', 'exam');

create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');

create type public.announcement_audience as enum ('school', 'class', 'role', 'individual');

create type public.announcement_priority as enum ('normal', 'important', 'urgent');

create type public.notification_type as enum (
  'assignment_published',
  'assignment_due_soon',
  'submission_graded',
  'quiz_published',
  'quiz_reminder',
  'quiz_graded',
  'grade_posted',
  'announcement',
  'attendance_flagged',
  'timetable_changed',
  'account',
  'system'
);

create type public.file_visibility as enum ('private', 'class', 'school', 'public');

-- Mirrors the storage buckets created in 20260801001100_storage.sql. Keeping
-- this an enum means a row in `files` can never point at a bucket that does
-- not exist.
create type public.storage_bucket as enum (
  'profile-photos',
  'assignment-uploads',
  'lesson-materials',
  'school-logos',
  'student-documents'
);

create type public.lesson_content_type as enum (
  'video', 'document', 'note', 'link', 'embed', 'slide'
);

create type public.audit_action as enum (
  'insert', 'update', 'delete', 'login', 'logout', 'export', 'permission_change'
);
