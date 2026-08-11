import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The guardian's view
 * ═══════════════════════════════════════════════════════════════════════════
 *  Everything here is scoped by `app.can_read_student()` and
 *  `app.can_read_class()`, both of which resolve through `app.my_children()`.
 *  Nothing in this file filters by parenthood, because nothing needs to: a
 *  guardian querying another family's child gets an empty result from the
 *  policy, not a refusal from a check written here that could be forgotten on
 *  the next screen.
 *
 *  What a guardian is deliberately *not* shown is the rest of the class. They
 *  see their own child's marks and their own child's work; the class average
 *  would be a comparison the school has not chosen to publish, and the roll
 *  would be other people's children.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ChildDetail {
  student_id: string;
  class: {
    id: string;
    name: string;
    arm: string;
    room: string | null;
    formTeacher: { id: string; user_id: string; full_name: string } | null;
  } | null;
  /** Who teaches them, subject by subject. */
  teachers: {
    subject_id: string;
    subject_name: string;
    subject_code: string;
    teacher_id: string | null;
    teacher_user_id: string | null;
    teacher_name: string;
  }[];
}

/**
 * A child's class, their form teacher and who teaches them what.
 *
 * `teacher_assignments` is readable school-wide, so this is narrowed by the
 * class the child is actually enrolled in rather than by the policy. That is
 * the one place on this screen where the filter is doing real work, and it is
 * doing presentational work: a guardian has no business scrolling the staffing
 * of a year group their child is not in.
 */
export async function getChildDetail(studentId: string, sessionId: string): Promise<ChildDetail> {
  const { data: enrolment, error: enrolmentError } = await supabase
    .from('enrollments')
    .select(
      `class:classes!enrollments_class_id_fkey (
         id, name, arm, room,
         form_teacher:teachers!classes_form_teacher_id_fkey (
           id, user_id, user:users!teachers_user_id_fkey (full_name)
         )
       )`,
    )
    .eq('student_id', studentId)
    .eq('academic_session_id', sessionId)
    .eq('status', 'active')
    .maybeSingle();

  if (enrolmentError) throw toAppError(enrolmentError);

  const row = enrolment as unknown as {
    class: {
      id: string;
      name: string;
      arm: string;
      room: string | null;
      form_teacher: { id: string; user_id: string; user: { full_name: string } | null } | null;
    } | null;
  } | null;

  const classRow = row?.class ?? null;

  if (!classRow) {
    return { student_id: studentId, class: null, teachers: [] };
  }

  const { data: teaching, error: teachingError } = await supabase
    .from('teacher_assignments')
    .select(
      `subject:subjects!teacher_assignments_subject_id_fkey (id, name, code),
       teacher:teachers!teacher_assignments_teacher_id_fkey (
         id, user_id, user:users!teachers_user_id_fkey (full_name)
       )`,
    )
    .eq('class_id', classRow.id)
    .eq('academic_session_id', sessionId);

  if (teachingError) throw toAppError(teachingError);

  const rows = teaching as unknown as {
    subject: { id: string; name: string; code: string } | null;
    teacher: { id: string; user_id: string; user: { full_name: string } | null } | null;
  }[];

  const teachers = rows
    .filter((entry) => entry.subject !== null)
    .map((entry) => ({
      subject_id: entry.subject!.id,
      subject_name: entry.subject!.name,
      subject_code: entry.subject!.code,
      teacher_id: entry.teacher?.id ?? null,
      teacher_user_id: entry.teacher?.user_id ?? null,
      teacher_name: entry.teacher?.user?.full_name ?? 'Not yet assigned',
    }))
    .sort((a, b) => a.subject_name.localeCompare(b.subject_name));

  return {
    student_id: studentId,
    class: {
      id: classRow.id,
      name: classRow.name,
      arm: classRow.arm,
      room: classRow.room,
      formTeacher: classRow.form_teacher
        ? {
            id: classRow.form_teacher.id,
            user_id: classRow.form_teacher.user_id,
            full_name: classRow.form_teacher.user?.full_name ?? 'Unnamed teacher',
          }
        : null,
    },
    teachers,
  };
}

export interface ChildWorkRow {
  id: string;
  title: string;
  subject: string;
  due_at: string;
  max_score: number;
  status: string | null;
  score: number | null;
  is_late: boolean;
  submitted_at: string | null;
}

/**
 * A child's assignments and how they went.
 *
 * Built from the assignments outward, not from the submissions: the ones a
 * guardian most needs to see are precisely the ones with no submission row, and
 * starting from `assignment_submissions` would hide every missed piece of work.
 */
export async function getChildWork(args: {
  studentId: string;
  classId: string;
  sessionId: string;
}): Promise<ChildWorkRow[]> {
  const [assignmentsResult, submissionsResult] = await Promise.all([
    supabase
      .from('assignments')
      .select('id, title, due_at, max_score, subject:subjects!assignments_subject_id_fkey (name)')
      .eq('class_id', args.classId)
      .eq('academic_session_id', args.sessionId)
      .eq('status', 'published')
      .order('due_at', { ascending: false }),

    supabase
      .from('assignment_submissions')
      .select('assignment_id, status, score, is_late, submitted_at')
      .eq('student_id', args.studentId),
  ]);

  if (assignmentsResult.error) throw toAppError(assignmentsResult.error);
  if (submissionsResult.error) throw toAppError(submissionsResult.error);

  const assignments = assignmentsResult.data as unknown as {
    id: string;
    title: string;
    due_at: string;
    max_score: number;
    subject: { name: string } | null;
  }[];

  const submissions = submissionsResult.data;
  const byAssignment = new Map(submissions.map((row) => [row.assignment_id, row]));

  return assignments.map((assignment) => {
    const submission = byAssignment.get(assignment.id);

    return {
      id: assignment.id,
      title: assignment.title,
      subject: assignment.subject?.name ?? 'Subject',
      due_at: assignment.due_at,
      max_score: assignment.max_score,
      status: submission?.status ?? null,
      // A mark is only shown once the work has been graded. A score sitting on
      // a submission the teacher has not finished with is a working figure, and
      // a guardian who sees it will treat it as final.
      score:
        submission?.status === 'graded' || submission?.status === 'returned'
          ? (submission.score ?? null)
          : null,
      is_late: submission?.is_late ?? false,
      submitted_at: submission?.submitted_at ?? null,
    };
  });
}

export interface ChildQuizRow {
  id: string;
  title: string;
  subject: string;
  total_points: number | null;
  attempt: {
    status: string;
    score: number | null;
    percentage: number | null;
    submitted_at: string | null;
  } | null;
}

/** A child's quizzes, and whether they sat them. */
export async function getChildQuizzes(args: {
  studentId: string;
  classId: string;
  sessionId: string;
}): Promise<ChildQuizRow[]> {
  const [quizzesResult, attemptsResult] = await Promise.all([
    supabase
      .from('quizzes')
      .select('id, title, total_points, subject:subjects!quizzes_subject_id_fkey (name)')
      .eq('class_id', args.classId)
      .eq('academic_session_id', args.sessionId)
      .eq('status', 'published')
      .order('created_at', { ascending: false }),

    supabase
      .from('quiz_attempts')
      .select('quiz_id, status, score, percentage, submitted_at')
      .eq('student_id', args.studentId),
  ]);

  if (quizzesResult.error) throw toAppError(quizzesResult.error);
  if (attemptsResult.error) throw toAppError(attemptsResult.error);

  const quizzes = quizzesResult.data as unknown as {
    id: string;
    title: string;
    total_points: number | null;
    subject: { name: string } | null;
  }[];

  const attempts = attemptsResult.data;
  // Best attempt per quiz, which is what a school records when several are
  // allowed. Ordering by percentage rather than recency for the same reason.
  const byQuiz = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    const existing = byQuiz.get(attempt.quiz_id);
    if (!existing || (attempt.percentage ?? -1) > (existing.percentage ?? -1)) {
      byQuiz.set(attempt.quiz_id, attempt);
    }
  }

  return quizzes.map((quiz) => {
    const attempt = byQuiz.get(quiz.id);

    return {
      id: quiz.id,
      title: quiz.title,
      subject: quiz.subject?.name ?? 'Subject',
      total_points: quiz.total_points,
      attempt: attempt
        ? {
            status: attempt.status,
            score: attempt.status === 'graded' ? attempt.score : null,
            percentage: attempt.status === 'graded' ? attempt.percentage : null,
            submitted_at: attempt.submitted_at,
          }
        : null,
    };
  });
}
