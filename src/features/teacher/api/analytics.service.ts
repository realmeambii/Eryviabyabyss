import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';

/**
 * Teaching analytics.
 *
 * Every figure here is computed from rows RLS has already narrowed to the
 * caller, so a teacher's "school average" is the average of what they teach —
 * not the school's, and not a number they should be comparing themselves
 * against without knowing which. The labels say so.
 *
 * Deliberately no aggregate RPC. A teacher's term is a few hundred grades and a
 * few hundred submissions; pulling them and folding in memory keeps the numbers
 * consistent with the lists on the same screen, which a separate `count(*)`
 * path cannot guarantee. If a school ever needs whole-year-group analysis that
 * changes — but that is an administrator's screen, not this one.
 */

export interface TeachingAnalytics {
  /** Published assignments across every class in scope. */
  assignmentsSet: number;
  /** Handed in ÷ expected, as a percentage. Null when nothing is set. */
  submissionRate: number | null;
  /** Submissions handed in but not yet marked. */
  awaitingMarking: number;
  markedLate: number;
  quizzesPublished: number;
  quizAttempts: number;
  /** Mean percentage across every graded quiz attempt. */
  quizAverage: number | null;
  /** Mean percentage across every published gradebook row. */
  gradeAverage: number | null;
  /** Marks per band of ten percent, index 0 = 0–9%. */
  distribution: number[];
  /** Per class, so a teacher can see which group is struggling. */
  byClass: ClassPerformance[];
  /** Pupils with nothing handed in — the engagement signal that matters. */
  disengaged: { student_id: string; full_name: string; missing: number }[];
}

export interface ClassPerformance {
  class_id: string;
  submitted: number;
  expected: number;
  averagePercentage: number | null;
}

interface GradeRow {
  class_id: string;
  percentage: number | null;
}

interface SubmissionRow {
  status: string;
  is_late: boolean;
  student_id: string;
  assignment: { class_id: string } | null;
}

export async function getTeachingAnalytics(args: {
  classIds: string[];
  sessionId: string;
}): Promise<TeachingAnalytics> {
  if (args.classIds.length === 0) {
    return {
      assignmentsSet: 0,
      submissionRate: null,
      awaitingMarking: 0,
      markedLate: 0,
      quizzesPublished: 0,
      quizAttempts: 0,
      quizAverage: null,
      gradeAverage: null,
      distribution: Array.from({ length: 10 }, () => 0),
      byClass: [],
      disengaged: [],
    };
  }

  const [assignments, submissions, quizzes, attempts, grades, roster] = await Promise.all([
    supabase
      .from('assignments')
      .select('id, class_id, status')
      .in('class_id', args.classIds)
      .eq('academic_session_id', args.sessionId),

    supabase
      .from('assignment_submissions')
      .select('status, is_late, student_id, assignment:assignments!inner(class_id)')
      .in('assignment.class_id', args.classIds),

    supabase
      .from('quizzes')
      .select('id, status')
      .in('class_id', args.classIds)
      .eq('academic_session_id', args.sessionId),

    supabase
      .from('quiz_attempts')
      .select('percentage, status, quiz:quizzes!inner(class_id)')
      .in('quiz.class_id', args.classIds),

    supabase
      .from('grades')
      .select('class_id, percentage')
      .in('class_id', args.classIds)
      .eq('academic_session_id', args.sessionId)
      .eq('is_published', true),

    supabase
      .from('enrollments')
      .select(
        `class_id,
         student:students!enrollments_student_id_fkey (
           id, user:users!students_user_id_fkey (full_name)
         )`,
      )
      .in('class_id', args.classIds)
      .eq('academic_session_id', args.sessionId)
      .eq('status', 'active'),
  ]);

  const failed = [assignments, submissions, quizzes, attempts, grades, roster].find(
    (result) => result.error,
  );
  if (failed?.error) throw toAppError(failed.error);

  const published = (assignments.data ?? []).filter((row) => row.status === 'published');
  const submissionRows = submissions.data as unknown as SubmissionRow[];
  const handedIn = submissionRows.filter((row) => row.status !== 'draft');

  const rosterRows = roster.data as unknown as {
    class_id: string;
    student: { id: string; user: { full_name: string } | null } | null;
  }[];

  // ── Grade distribution and average ──────────────────────────────────────
  const gradeRows = grades.data as unknown as GradeRow[];
  const percentages = gradeRows
    .map((row) => row.percentage)
    .filter((value): value is number => value !== null);

  const distribution = Array.from({ length: 10 }, () => 0);
  for (const value of percentages) {
    // 100% belongs in the top band, not an eleventh one.
    const band = Math.min(9, Math.max(0, Math.floor(value / 10)));
    distribution[band] = (distribution[band] ?? 0) + 1;
  }

  const mean = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  // ── Per class ───────────────────────────────────────────────────────────
  const byClass: ClassPerformance[] = args.classIds.map((classId) => {
    const classRoll = rosterRows.filter((row) => row.class_id === classId).length;
    const classPublished = published.filter((row) => row.class_id === classId).length;

    return {
      class_id: classId,
      submitted: handedIn.filter((row) => row.assignment?.class_id === classId).length,
      expected: classPublished * classRoll,
      averagePercentage: mean(
        gradeRows
          .filter((row) => row.class_id === classId)
          .map((row) => row.percentage)
          .filter((value): value is number => value !== null),
      ),
    };
  });

  //  How many submissions *should* exist, summed per class.
  //
  //  Not `published.length * rosterRows.length` — a piece of work set for JSS 2A
  //  is not owed by JSS 2B. Multiplying every assignment by every pupil the
  //  teacher takes inflates the denominator by roughly the number of classes,
  //  which reported 13% where the true figure was 65%: a teacher would have
  //  concluded their pupils had stopped handing work in.
  const expected = byClass.reduce((sum, row) => sum + row.expected, 0);

  // ── Engagement ──────────────────────────────────────────────────────────
  //  Counted as work *not* handed in rather than logins. A pupil who reads
  //  every lesson and hands in nothing is the one a teacher needs to see, and a
  //  login timestamp would not show them.
  const submittedBy = new Map<string, number>();
  for (const row of handedIn) {
    submittedBy.set(row.student_id, (submittedBy.get(row.student_id) ?? 0) + 1);
  }

  const disengaged = rosterRows
    .filter((row) => row.student !== null)
    .map((row) => {
      const expectedForClass = published.filter(
        (assignment) => assignment.class_id === row.class_id,
      ).length;
      return {
        student_id: row.student!.id,
        full_name: row.student!.user?.full_name ?? 'Unnamed student',
        missing: Math.max(0, expectedForClass - (submittedBy.get(row.student!.id) ?? 0)),
      };
    })
    .filter((row) => row.missing > 0)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 10);

  const attemptRows = attempts.data as unknown as {
    percentage: number | null;
    status: string;
  }[];
  const sat = attemptRows.filter((row) => row.status !== 'in_progress');

  return {
    assignmentsSet: published.length,
    submissionRate: expected > 0 ? (handedIn.length / expected) * 100 : null,
    awaitingMarking: submissionRows.filter((row) =>
      ['submitted', 'late', 'resubmitted'].includes(row.status),
    ).length,
    markedLate: handedIn.filter((row) => row.is_late).length,
    quizzesPublished: (quizzes.data ?? []).filter((row) => row.status === 'published').length,
    quizAttempts: sat.length,
    quizAverage: mean(
      sat.map((row) => row.percentage).filter((value): value is number => value !== null),
    ),
    gradeAverage: mean(percentages),
    distribution,
    byClass,
    disengaged,
  };
}
