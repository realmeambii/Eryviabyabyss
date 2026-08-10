import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { SchoolClass, Subject, TeacherAssignment } from '@/shared/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Teacher data access — the foundation every teacher screen sits on
 * ═══════════════════════════════════════════════════════════════════════════
 *  One idea runs through this file: a teacher's world is defined by the rows
 *  in `teacher_assignments`. Which classes they see, which subjects they may
 *  author against, whose work they may mark, which pupils appear in a picker —
 *  all of it is a projection of "the (class, subject) pairs assigned to me this
 *  term".
 *
 *  So `listMyAssignments()` is fetched once and everything else derives from
 *  it in memory. That is not a caching trick; it is what keeps the screens
 *  agreeing with each other. Two pages that each ran their own scope query
 *  would eventually disagree about what a teacher teaches — usually at the
 *  worst moment, when one of them lets a mark be entered against a class the
 *  other says isn't theirs.
 *
 *  Scope is *also* enforced in the database. `app.teaches_class()` and
 *  `app.teaches_class_subject()` sit in the USING clause of every teacher
 *  policy, so a crafted request that skips the filters below still comes back
 *  empty. The `.eq('teacher_id', …)` calls here are for correctness and index
 *  use, not for security — RLS is the gate.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Scope ───────────────────────────────────────────────────────────────────

/** One (class, subject) pairing, with both sides resolved. */
export type MyAssignment = Pick<
  TeacherAssignment,
  'id' | 'teacher_id' | 'class_id' | 'subject_id' | 'academic_session_id' | 'is_lead'
> & {
  class: Pick<SchoolClass, 'id' | 'name' | 'arm' | 'level' | 'room' | 'capacity'> | null;
  subject: Pick<Subject, 'id' | 'name' | 'code' | 'color' | 'is_core'> | null;
};

const ASSIGNMENT_SELECT = `id, teacher_id, class_id, subject_id, academic_session_id, is_lead,
  class:classes!teacher_assignments_class_id_fkey (id, name, arm, level, room, capacity),
  subject:subjects!teacher_assignments_subject_id_fkey (id, name, code, color, is_core)`;

/**
 * Every pairing assigned to this teacher for a term.
 *
 * Ordered by class level then subject name so the derived lists below come out
 * in a stable, teachable order without a second sort at each call site.
 */
export async function listMyAssignments(
  teacherId: string,
  sessionId?: string,
): Promise<MyAssignment[]> {
  let query = supabase
    .from('teacher_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('teacher_id', teacherId);

  if (sessionId) query = query.eq('academic_session_id', sessionId);

  const { data, error } = await query;
  if (error) throw toAppError(error);

  return (data as unknown as MyAssignment[]).sort(
    (a, b) =>
      (a.class?.level ?? 0) - (b.class?.level ?? 0) ||
      (a.class?.arm ?? '').localeCompare(b.class?.arm ?? '') ||
      (a.subject?.name ?? '').localeCompare(b.subject?.name ?? ''),
  );
}

// ── Derived views ───────────────────────────────────────────────────────────
//  Pure functions over the scope. Kept here beside the query rather than in a
//  hook so the same folding is available to any caller — a page, a picker, a
//  test — and so the shapes below have exactly one definition.

export interface MyClass {
  id: string;
  name: string;
  arm: string;
  level: number;
  room: string | null;
  capacity: number;
  /** The subjects this teacher takes with this class. */
  subjects: NonNullable<MyAssignment['subject']>[];
  /** True when they lead at least one subject here. */
  isLead: boolean;
}

export function foldClasses(assignments: MyAssignment[]): MyClass[] {
  const byClass = new Map<string, MyClass>();

  for (const assignment of assignments) {
    const row = assignment.class;
    if (!row) continue;

    const existing = byClass.get(row.id);
    const entry =
      existing ??
      ({
        id: row.id,
        name: row.name,
        arm: row.arm,
        level: row.level,
        room: row.room,
        capacity: row.capacity,
        subjects: [],
        isLead: false,
      } satisfies MyClass);

    if (assignment.subject && !entry.subjects.some((s) => s.id === assignment.subject!.id)) {
      entry.subjects.push(assignment.subject);
    }
    entry.isLead = entry.isLead || assignment.is_lead;

    byClass.set(row.id, entry);
  }

  return [...byClass.values()];
}

export interface MySubject {
  id: string;
  name: string;
  code: string;
  color: string;
  is_core: boolean;
  /** The classes this teacher takes this subject with. */
  classes: NonNullable<MyAssignment['class']>[];
}

export function foldSubjects(assignments: MyAssignment[]): MySubject[] {
  const bySubject = new Map<string, MySubject>();

  for (const assignment of assignments) {
    const row = assignment.subject;
    if (!row) continue;

    const entry =
      bySubject.get(row.id) ??
      ({
        id: row.id,
        name: row.name,
        code: row.code,
        color: row.color,
        is_core: row.is_core,
        classes: [],
      } satisfies MySubject);

    if (assignment.class && !entry.classes.some((c) => c.id === assignment.class!.id)) {
      entry.classes.push(assignment.class);
    }

    bySubject.set(row.id, entry);
  }

  return [...bySubject.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ── Class roster ────────────────────────────────────────────────────────────

export interface RosterStudent {
  student_id: string;
  user_id: string;
  full_name: string;
  admission_number: string;
  avatar_path: string | null;
  roll_number: number | null;
  enrollment_status: string;
}

/**
 * The pupils enrolled in a class this term.
 *
 * Reads `enrollments` rather than `students.current_class_id`: the denormalised
 * pointer only tracks the *current* term, so a roster built on it silently
 * returns today's class when asked about last term's. `enrollments` is the
 * authoritative history and is what the roll is.
 */
export async function getClassRoster(classId: string, sessionId: string): Promise<RosterStudent[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select(
      `roll_number, status,
       student:students!enrollments_student_id_fkey (
         id, admission_number,
         user:users!students_user_id_fkey (id, full_name, avatar_path)
       )`,
    )
    .eq('class_id', classId)
    .eq('academic_session_id', sessionId)
    .eq('status', 'active');

  if (error) throw toAppError(error);

  const rows = data as unknown as {
    roll_number: number | null;
    status: string;
    student: {
      id: string;
      admission_number: string;
      user: { id: string; full_name: string; avatar_path: string | null } | null;
    } | null;
  }[];

  return rows
    .filter((row) => row.student !== null)
    .map((row) => ({
      student_id: row.student!.id,
      user_id: row.student!.user?.id ?? '',
      full_name: row.student!.user?.full_name ?? 'Unnamed student',
      admission_number: row.student!.admission_number,
      avatar_path: row.student!.user?.avatar_path ?? null,
      roll_number: row.roll_number,
      enrollment_status: row.status,
    }))
    .sort(
      (a, b) =>
        (a.roll_number ?? Number.MAX_SAFE_INTEGER) - (b.roll_number ?? Number.MAX_SAFE_INTEGER) ||
        a.full_name.localeCompare(b.full_name),
    );
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export interface TeacherWorkload {
  /** Submissions handed in and not yet marked. */
  pendingSubmissions: number;
  /** Quiz attempts submitted but not yet graded — essays need a human. */
  attemptsAwaitingReview: number;
  /** Assignments still in draft. */
  draftAssignments: number;
  /** Lessons still in draft. */
  draftLessons: number;
}

/**
 * The four numbers on the dashboard tiles.
 *
 * Four `head: true` counts rather than four selects: PostgREST returns the
 * count in a header and no rows at all, so this is four cheap round trips
 * instead of dragging a marking queue across the wire to call `.length` on it.
 *
 * Every count is already confined to this teacher by RLS, but each is also
 * filtered by the class ids in scope — an administrator opening this screen
 * would otherwise see the whole school's backlog under a teacher's heading.
 */
export async function getWorkload(classIds: string[], sessionId: string): Promise<TeacherWorkload> {
  if (classIds.length === 0) {
    return {
      pendingSubmissions: 0,
      attemptsAwaitingReview: 0,
      draftAssignments: 0,
      draftLessons: 0,
    };
  }

  const [submissions, attempts, drafts, lessons] = await Promise.all([
    supabase
      .from('assignment_submissions')
      .select('id, assignment:assignments!inner(class_id)', { count: 'exact', head: true })
      .in('assignment.class_id', classIds)
      .in('status', ['submitted', 'late', 'resubmitted']),

    supabase
      .from('quiz_attempts')
      .select('id, quiz:quizzes!inner(class_id)', { count: 'exact', head: true })
      .in('quiz.class_id', classIds)
      .eq('status', 'submitted'),

    supabase
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .in('class_id', classIds)
      .eq('academic_session_id', sessionId)
      .eq('status', 'draft'),

    supabase
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .in('class_id', classIds)
      .eq('academic_session_id', sessionId)
      .eq('status', 'draft'),
  ]);

  const failed = [submissions, attempts, drafts, lessons].find((result) => result.error);
  if (failed?.error) throw toAppError(failed.error);

  return {
    pendingSubmissions: submissions.count ?? 0,
    attemptsAwaitingReview: attempts.count ?? 0,
    draftAssignments: drafts.count ?? 0,
    draftLessons: lessons.count ?? 0,
  };
}

// ── Class statistics ────────────────────────────────────────────────────────

export interface ClassStatistics {
  studentCount: number;
  assignmentCount: number;
  lessonCount: number;
  /** Mean percentage across every published grade for the class. Null when none. */
  averagePercentage: number | null;
  /** Handed-in ÷ expected, across published assignments. Null when nothing is set. */
  submissionRate: number | null;
}

export async function getClassStatistics(
  classId: string,
  sessionId: string,
): Promise<ClassStatistics> {
  const [roster, assignments, lessons, grades] = await Promise.all([
    supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('academic_session_id', sessionId)
      .eq('status', 'active'),

    supabase
      .from('assignments')
      .select('id, status')
      .eq('class_id', classId)
      .eq('academic_session_id', sessionId),

    supabase
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('academic_session_id', sessionId),

    // `percentage` is GENERATED STORED, so the average is read straight off the
    // column rather than recomputed from score/max_score here.
    supabase
      .from('grades')
      .select('percentage')
      .eq('class_id', classId)
      .eq('academic_session_id', sessionId)
      .eq('is_published', true),
  ]);

  const failed = [roster, assignments, lessons, grades].find((result) => result.error);
  if (failed?.error) throw toAppError(failed.error);

  const publishedAssignments = (assignments.data ?? []).filter(
    (row) => row.status === 'published',
  ).length;
  const studentCount = roster.count ?? 0;

  const percentages = (grades.data ?? [])
    .map((row) => row.percentage)
    .filter((value): value is number => value !== null);

  const averagePercentage =
    percentages.length > 0
      ? percentages.reduce((total, value) => total + value, 0) / percentages.length
      : null;

  let submissionRate: number | null = null;
  if (publishedAssignments > 0 && studentCount > 0) {
    const { count, error } = await supabase
      .from('assignment_submissions')
      .select('id, assignment:assignments!inner(class_id, status)', {
        count: 'exact',
        head: true,
      })
      .eq('assignment.class_id', classId)
      .eq('assignment.status', 'published')
      .neq('status', 'draft');

    if (error) throw toAppError(error);
    // Expected = every pupil on roll × every published assignment.
    submissionRate = ((count ?? 0) / (publishedAssignments * studentCount)) * 100;
  }

  return {
    studentCount,
    assignmentCount: (assignments.data ?? []).length,
    lessonCount: lessons.count ?? 0,
    averagePercentage,
    submissionRate,
  };
}

// ── Marking queue ───────────────────────────────────────────────────────────

export interface PendingSubmission {
  id: string;
  status: string;
  submitted_at: string | null;
  is_late: boolean;
  student: { id: string; full_name: string; admission_number: string } | null;
  assignment: {
    id: string;
    title: string;
    max_score: number;
    due_at: string;
    class_id: string;
    subject_id: string;
  } | null;
}

/**
 * Everything waiting to be marked, oldest first.
 *
 * "Oldest first" is deliberate: a pupil who handed in on Monday should not be
 * behind one who handed in this morning because the list happened to be sorted
 * by name.
 */
export async function listPendingSubmissions(
  classIds: string[],
  options: { limit?: number; classId?: string; subjectId?: string } = {},
): Promise<PendingSubmission[]> {
  if (classIds.length === 0) return [];

  let query = supabase
    .from('assignment_submissions')
    .select(
      `id, status, submitted_at, is_late,
       student:students!assignment_submissions_student_id_fkey (
         id, admission_number, user:users!students_user_id_fkey (full_name)
       ),
       assignment:assignments!inner (
         id, title, max_score, due_at, class_id, subject_id
       )`,
    )
    .in('status', ['submitted', 'late', 'resubmitted'])
    .order('submitted_at', { ascending: true })
    .limit(options.limit ?? 50);

  query = options.classId
    ? query.eq('assignment.class_id', options.classId)
    : query.in('assignment.class_id', classIds);

  if (options.subjectId) query = query.eq('assignment.subject_id', options.subjectId);

  const { data, error } = await query;
  if (error) throw toAppError(error);

  const rows = data as unknown as (Omit<PendingSubmission, 'student'> & {
    student: {
      id: string;
      admission_number: string;
      user: { full_name: string } | null;
    } | null;
  })[];

  return rows.map((row) => ({
    ...row,
    student: row.student
      ? {
          id: row.student.id,
          full_name: row.student.user?.full_name ?? 'Unnamed student',
          admission_number: row.student.admission_number,
        }
      : null,
  }));
}

export interface PendingAttempt {
  id: string;
  status: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number | null;
  student: { id: string; full_name: string; admission_number: string } | null;
  quiz: {
    id: string;
    title: string;
    class_id: string;
    subject_id: string;
    total_points: number | null;
  } | null;
}

/**
 * Quiz papers the auto-marker could not finish.
 *
 * A paper stops at `submitted` when it holds an essay, a short answer or
 * anything else `app.grade_quiz_attempt()` declined to judge; the objective
 * questions are already scored and `score` carries that running total, which is
 * why the queue shows it as a starting point rather than an empty box.
 *
 * Sorted oldest first for the same reason the submission queue is: a pupil who
 * sat the paper on Monday should not wait behind one who sat it this morning.
 */
export async function listPendingAttempts(
  classIds: string[],
  options: { limit?: number; classId?: string; subjectId?: string } = {},
): Promise<PendingAttempt[]> {
  if (classIds.length === 0) return [];

  let query = supabase
    .from('quiz_attempts')
    .select(
      `id, status, submitted_at, score, max_score,
       student:students!quiz_attempts_student_id_fkey (
         id, admission_number, user:users!students_user_id_fkey (full_name)
       ),
       quiz:quizzes!inner (id, title, class_id, subject_id, total_points)`,
    )
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: true })
    .limit(options.limit ?? 50);

  query = options.classId
    ? query.eq('quiz.class_id', options.classId)
    : query.in('quiz.class_id', classIds);

  if (options.subjectId) query = query.eq('quiz.subject_id', options.subjectId);

  const { data, error } = await query;
  if (error) throw toAppError(error);

  const rows = data as unknown as (Omit<PendingAttempt, 'student'> & {
    student: {
      id: string;
      admission_number: string;
      user: { full_name: string } | null;
    } | null;
  })[];

  return rows.map((row) => ({
    ...row,
    student: row.student
      ? {
          id: row.student.id,
          full_name: row.student.user?.full_name ?? 'Unnamed student',
          admission_number: row.student.admission_number,
        }
      : null,
  }));
}
