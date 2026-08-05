import { useQuery } from '@tanstack/react-query';

import { listAnnouncements } from '@/features/announcements';
import { listAssignments, getMySubmission } from '@/features/assignments';
import { listStudentGrades } from '@/features/grades';
import { getClassTimetable } from '@/features/timetable';
import { listQuizzes } from '@/features/quizzes';
import { queryKeys } from '@/shared/lib/query-keys';

import { listClassSubjects } from '../api/student.service';
import { useStudentContext } from './use-student-context';

/**
 * Read hooks for the student portal.
 *
 * Each one is a thin wrapper that supplies the student's class and term from
 * `useStudentContext()` and stays disabled until those are known — which is
 * what stops every screen firing a query with `undefined` in the filter and
 * getting the whole school back.
 */

export function useStudentSubjects() {
  const { classId, sessionId } = useStudentContext();

  return useQuery({
    queryKey: queryKeys.classes.subjects(classId ?? 'none'),
    queryFn: () => listClassSubjects(classId!, sessionId!),
    enabled: Boolean(classId && sessionId),
    staleTime: 5 * 60_000,
  });
}

export function useStudentAssignments(options: { subjectId?: string } = {}) {
  const { classId, sessionId } = useStudentContext();

  return useQuery({
    queryKey: queryKeys.assignments.list({
      classId,
      sessionId,
      subjectId: options.subjectId ?? null,
    }),
    queryFn: () =>
      listAssignments({
        classId: classId!,
        sessionId: sessionId!,
        ...(options.subjectId ? { subjectId: options.subjectId } : {}),
      }),
    enabled: Boolean(classId && sessionId),
  });
}

/** The caller's own submission for one assignment, if any. */
export function useMySubmission(assignmentId: string | undefined) {
  const { studentId } = useStudentContext();

  return useQuery({
    queryKey: queryKeys.assignments.mySubmission(assignmentId ?? 'none'),
    queryFn: () => getMySubmission(assignmentId!, studentId!),
    enabled: Boolean(assignmentId && studentId),
  });
}

export function useStudentGrades(options: { subjectId?: string } = {}) {
  const { studentId, sessionId } = useStudentContext();

  return useQuery({
    queryKey: queryKeys.grades.forStudent(studentId ?? 'none', sessionId ?? undefined),
    queryFn: () =>
      listStudentGrades(studentId!, {
        ...(sessionId ? { sessionId } : {}),
        ...(options.subjectId ? { subjectId: options.subjectId } : {}),
      }),
    enabled: Boolean(studentId && sessionId),
    select: options.subjectId
      ? (rows) => rows.filter((row) => row.subject_id === options.subjectId)
      : undefined,
  });
}

export function useStudentTimetable() {
  const { classId, sessionId } = useStudentContext();

  return useQuery({
    queryKey: queryKeys.timetable.forClass(classId ?? 'none'),
    queryFn: () => getClassTimetable(classId!, sessionId ?? undefined),
    enabled: Boolean(classId),
    // The timetable is fixed for the term.
    staleTime: 30 * 60_000,
  });
}

export function useStudentQuizzes(options: { subjectId?: string } = {}) {
  const { classId, sessionId } = useStudentContext();

  return useQuery({
    queryKey: queryKeys.quizzes.list({
      classId,
      sessionId,
      subjectId: options.subjectId ?? null,
    }),
    queryFn: () =>
      listQuizzes({
        classId: classId!,
        sessionId: sessionId!,
        ...(options.subjectId ? { subjectId: options.subjectId } : {}),
      }),
    enabled: Boolean(classId && sessionId),
  });
}

/**
 * Announcements the student may see.
 *
 * Deliberately unfiltered by audience: `announcements_select_audience` already
 * returns school-wide notices, their class's notices, notices for the student
 * role and anything addressed to them personally. Filtering here would narrow
 * that incorrectly.
 */
export function useStudentAnnouncements(options: { limit?: number } = {}) {
  const { classId } = useStudentContext();

  return useQuery({
    queryKey: queryKeys.announcements.list({ scope: 'student', classId }),
    queryFn: () => listAnnouncements({ limit: options.limit ?? 50 }),
    enabled: Boolean(classId),
  });
}
