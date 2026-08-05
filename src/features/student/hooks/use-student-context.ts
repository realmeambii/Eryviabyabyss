import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/features/auth';
import { queryKeys } from '@/shared/lib/query-keys';

import { getCurrentEnrollment, type CurrentEnrollment } from '../api/student.service';

export interface StudentContext {
  /** `students.id` — not the auth user id. */
  studentId: string | null;
  /** The class they sit in this term. Null until the enrolment query resolves. */
  classId: string | null;
  sessionId: string | null;
  enrollment: CurrentEnrollment | null;
  className: string | null;
  formTeacherName: string | null;
  isLoading: boolean;
  /**
   * True once we know there is no active enrolment — a student the office has
   * created but not yet placed in a class. Screens show an empty state rather
   * than spinning forever.
   */
  isUnenrolled: boolean;
}

/**
 * The student's place in the school: their id, their class, the current term.
 *
 * Every student screen needs these three before it can ask for anything else,
 * so it lives in one hook and one cache entry rather than being re-derived per
 * page. `current_user_context()` already supplied `student_id` and the current
 * session at sign-in, so this only adds the enrolment lookup.
 */
export function useStudentContext(): StudentContext {
  const { studentId, currentSession } = useCurrentUser();
  const sessionId = currentSession?.id ?? null;

  const query = useQuery({
    queryKey: queryKeys.students.enrollment(studentId ?? 'none', sessionId ?? 'none'),
    queryFn: () => getCurrentEnrollment(studentId!, sessionId!),
    enabled: Boolean(studentId && sessionId),
    // A student's class does not change during a session.
    staleTime: 10 * 60_000,
  });

  const enrollment = query.data ?? null;

  return {
    studentId,
    sessionId,
    enrollment,
    classId: enrollment?.class_id ?? null,
    className: enrollment?.class ? `${enrollment.class.name}${enrollment.class.arm}` : null,
    formTeacherName: enrollment?.class?.form_teacher?.user?.full_name ?? null,
    isLoading: query.isPending && Boolean(studentId && sessionId),
    isUnenrolled: query.isSuccess && enrollment === null,
  };
}
