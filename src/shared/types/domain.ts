import type { Enums, Json, Tables } from './database.types';

/**
 * Domain aliases.
 *
 * Every name here resolves back to `database.types.ts`. Nothing in this file
 * declares a *shape* — it only gives generated rows names the rest of the code
 * can read. If a field is missing from one of these, the fix is a migration
 * plus `npm run db:types`, never an interface written by hand.
 */

// ── Rows ────────────────────────────────────────────────────────────────────
export type School = Tables<'schools'>;
export type Role = Tables<'roles'>;
export type UserProfile = Tables<'users'>;
export type UserRole = Tables<'user_roles'>;
export type AcademicSession = Tables<'academic_sessions'>;
export type Subject = Tables<'subjects'>;
export type Teacher = Tables<'teachers'>;
export type SchoolClass = Tables<'classes'>;
export type Student = Tables<'students'>;
export type Parent = Tables<'parents'>;
export type ParentStudent = Tables<'parent_students'>;
export type ClassSubject = Tables<'class_subjects'>;
export type Enrollment = Tables<'enrollments'>;
export type TeacherAssignment = Tables<'teacher_assignments'>;
export type Lesson = Tables<'lessons'>;
export type TimetableSlot = Tables<'timetable_slots'>;
export type Assignment = Tables<'assignments'>;
export type AssignmentSubmission = Tables<'assignment_submissions'>;
export type Quiz = Tables<'quizzes'>;
export type QuizQuestion = Tables<'quiz_questions'>;
export type QuizAttempt = Tables<'quiz_attempts'>;
export type Grade = Tables<'grades'>;
export type Announcement = Tables<'announcements'>;
export type Notification = Tables<'notifications'>;
export type StoredFile = Tables<'files'>;
export type AuditLog = Tables<'audit_logs'>;

// ── Enums ───────────────────────────────────────────────────────────────────
export type AcademicTerm = Enums<'academic_term'>;
export type AnnouncementAudience = Enums<'announcement_audience'>;
export type AnnouncementPriority = Enums<'announcement_priority'>;
export type AssessmentType = Enums<'assessment_type'>;
export type AttemptStatus = Enums<'attempt_status'>;
export type EmploymentType = Enums<'employment_type'>;
export type EnrollmentStatus = Enums<'enrollment_status'>;
export type FileVisibility = Enums<'file_visibility'>;
export type Gender = Enums<'gender'>;
export type GradeSource = Enums<'grade_source'>;
export type GuardianRelationship = Enums<'guardian_relationship'>;
export type LessonContentType = Enums<'lesson_content_type'>;
export type NotificationType = Enums<'notification_type'>;
export type PublicationStatus = Enums<'publication_status'>;
export type QuestionType = Enums<'question_type'>;
export type StorageBucket = Enums<'storage_bucket'>;
export type StudentStatus = Enums<'student_status'>;
export type SubmissionStatus = Enums<'submission_status'>;
export type UserStatus = Enums<'user_status'>;

/**
 * The four system roles. Kept as a literal union rather than `string` so a
 * typo in `<RequireRole roles={['teachr']}>` is a compile error.
 *
 * `roles` is a table, so a school can add its own — those arrive as plain
 * strings and are handled by `AppRoleOrCustom`.
 */
export const APP_ROLES = ['administrator', 'teacher', 'student', 'parent'] as const;
export type AppRole = (typeof APP_ROLES)[number];
// `string & Record<never, never>` keeps the four literals in autocomplete while
// still accepting a school's own custom role slug.
export type AppRoleOrCustom = AppRole | (string & Record<never, never>);

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

/** One band of a school's grading scale, as stored in `schools.grading_scale`. */
export interface GradeBand {
  grade: string;
  min: number;
  max: number;
  remark: string;
}

/** A child as returned by `current_user_context()` for a parent. */
export interface ChildSummary {
  student_id: string;
  user_id: string;
  full_name: string;
  admission_number: string;
  class_id: string | null;
  avatar_path: string | null;
}

/** The school fields `current_user_context()` returns (not the whole row). */
export interface SchoolSummary {
  id: string;
  name: string;
  slug: string;
  motto: string | null;
  logo_path: string | null;
  timezone: string;
  locale: string;
  grading_scale: GradeBand[];
}

export interface SessionSummary {
  id: string;
  name: string;
  term: AcademicTerm;
  starts_on: string;
  ends_on: string;
}

/**
 * The single bootstrap payload, mirroring `public.current_user_context()`.
 *
 * The RPC is typed `Json` on the wire because PostgREST cannot describe a
 * `jsonb` return value more precisely; `auth.service.ts` validates the payload
 * against a Zod schema and only then hands back this type.
 */
export interface UserContext {
  profile: UserProfile;
  roles: AppRoleOrCustom[];
  school: SchoolSummary | null;
  student_id: string | null;
  teacher_id: string | null;
  parent_id: string | null;
  children: ChildSummary[];
  current_session: SessionSummary | null;
  unread_notifications: number;
}

/**
 * A quiz question as a candidate receives it.
 *
 * No `correct_answers`, and no `match` on an option — `get_quiz_paper()` strips
 * it, because the matching shape stores the answer there. The right-hand items
 * arrive in `match_pool`, shuffled independently so their order carries no hint.
 */
export interface QuizPaperQuestion {
  id: string;
  sort_order: number;
  question_type: QuestionType;
  prompt: string;
  options: { id: string; label: string }[] | null;
  /** Matching only: every right-hand item, shuffled. */
  match_pool: string[] | null;
  points: number;
  media_path: string | null;
}

/** Keyed by question id; each value is the chosen option id(s) or free text. */
export type QuizResponses = Record<string, string[]>;

export type { Json };

// ── Shared query shapes ─────────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface SortParams<TColumn extends string = string> {
  sortBy?: TColumn;
  ascending?: boolean;
}

// ── Teacher module ──────────────────────────────────────────────────────────
export type QuestionBankItem = Tables<'question_bank_items'>;
export type StudentNote = Tables<'student_notes'>;

/** One criterion of an assignment rubric, as stored in `assignments.rubric`. */
export interface RubricCriterion {
  id: string;
  criterion: string;
  points: number;
  descriptor?: string;
}

export type Conversation = Tables<'conversations'>;
export type ConversationParticipant = Tables<'conversation_participants'>;
export type Message = Tables<'messages'>;
