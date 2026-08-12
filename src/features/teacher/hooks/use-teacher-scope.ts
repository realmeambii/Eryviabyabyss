import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/features/auth';
import { queryKeys } from '@/shared/lib/query-keys';

import { foldClasses, foldPairs, foldSubjects, listMyAssignments } from '../api/teacher.service';
import type { MyAssignment, MyClass, MySubject, TeachingPair } from '../api/teacher.service';

/**
 * The one query every teacher screen shares.
 *
 * `teacher_assignments` for the current term is small — a busy teacher has
 * perhaps fifteen rows — and it answers every scoping question the portal
 * asks: which classes, which subjects, which pupils, which pickers. Fetching
 * it once under a single key means the dashboard, the class list and a lesson
 * editor opened three clicks later all read the same cache entry and cannot
 * disagree about what this teacher teaches.
 *
 * The folds are memoised on the query data rather than done inside `select`,
 * because `select` runs on every render and these allocate new arrays — which
 * would defeat the referential stability that stops child components
 * re-rendering.
 */
export interface TeacherScope {
  teacherId: string | null;
  sessionId: string | null;
  schoolId: string | null;
  assignments: MyAssignment[];
  classes: MyClass[];
  subjects: MySubject[];
  /** Class ids in scope. The filter every other teacher query is built on. */
  classIds: string[];
  /**
   * The (class, subject) pairs in scope.
   *
   * What anything to do with *marking* must filter on: reading a class is
   * broader than marking a subject within it, and `classIds` alone would offer
   * a teacher work that belongs to a colleague.
   */
  pairs: TeachingPair[];
  isPending: boolean;
  error: Error | null;
  /** True once we know the teacher has nothing assigned this term. */
  isUnassigned: boolean;
}

export function useTeacherScope(): TeacherScope {
  const { teacherId, currentSession, school } = useCurrentUser();
  const sessionId = currentSession?.id ?? null;

  const query = useQuery({
    queryKey: queryKeys.teachers.scope(teacherId ?? 'none', sessionId),
    queryFn: () => listMyAssignments(teacherId!, sessionId ?? undefined),
    enabled: Boolean(teacherId && sessionId),
    // A timetable does not change during a lesson. Five minutes removes almost
    // all the refetch traffic from navigating between teacher screens.
    staleTime: 5 * 60_000,
  });

  const assignments = useMemo(() => query.data ?? [], [query.data]);
  const classes = useMemo(() => foldClasses(assignments), [assignments]);
  const subjects = useMemo(() => foldSubjects(assignments), [assignments]);
  const classIds = useMemo(() => classes.map((row) => row.id), [classes]);
  const pairs = useMemo(() => foldPairs(assignments), [assignments]);

  return {
    teacherId: teacherId ?? null,
    sessionId,
    schoolId: school?.id ?? null,
    assignments,
    classes,
    subjects,
    classIds,
    pairs,
    isPending: query.isPending,
    error: query.error,
    isUnassigned: !query.isPending && !query.error && assignments.length === 0,
  };
}

/** A single class from the scope, by id. Null while loading or out of scope. */
export function useMyClass(classId: string | undefined): MyClass | null {
  const { classes } = useTeacherScope();
  return classes.find((row) => row.id === classId) ?? null;
}

/** A single subject from the scope, by id. */
export function useMySubject(subjectId: string | undefined): MySubject | null {
  const { subjects } = useTeacherScope();
  return subjects.find((row) => row.id === subjectId) ?? null;
}
