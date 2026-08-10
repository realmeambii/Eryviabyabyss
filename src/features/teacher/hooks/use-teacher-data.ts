import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/features/auth';
import { getTeacherTimetable } from '@/features/timetable';
import { queryKeys } from '@/shared/lib/query-keys';

import {
  getClassRoster,
  getClassStatistics,
  getWorkload,
  listPendingAttempts,
  listPendingSubmissions,
} from '../api/teacher.service';
import { useTeacherScope } from './use-teacher-scope';

/**
 * Everything a teacher screen reads that is *not* the scope itself.
 *
 * All of these depend on the scope, so all of them stay disabled until it has
 * resolved. That is what stops the dashboard firing a marking-queue query with
 * an empty class list on first paint and caching the empty answer.
 */

export function useTeacherWorkload() {
  const { teacherId, sessionId, classIds, isPending } = useTeacherScope();

  return useQuery({
    queryKey: queryKeys.teachers.workload(teacherId ?? 'none', sessionId),
    queryFn: () => getWorkload(classIds, sessionId!),
    enabled: Boolean(teacherId && sessionId) && !isPending,
    // The backlog moves as pupils hand in; a minute is fresh enough for a tile
    // and stops the dashboard hammering four count queries on every focus.
    staleTime: 60_000,
  });
}

export function useClassRoster(classId: string | undefined) {
  const { sessionId } = useTeacherScope();

  return useQuery({
    queryKey: queryKeys.teachers.roster(classId ?? 'none', sessionId ?? 'none'),
    queryFn: () => getClassRoster(classId!, sessionId!),
    enabled: Boolean(classId && sessionId),
    // A roll changes when a pupil is admitted or moved — rare, and an
    // administrator action rather than a teacher one.
    staleTime: 5 * 60_000,
  });
}

export function useClassStatistics(classId: string | undefined) {
  const { sessionId } = useTeacherScope();

  return useQuery({
    queryKey: queryKeys.teachers.classStats(classId ?? 'none', sessionId ?? 'none'),
    queryFn: () => getClassStatistics(classId!, sessionId!),
    enabled: Boolean(classId && sessionId),
    staleTime: 60_000,
  });
}

export function useMarkingQueue(
  options: { classId?: string; subjectId?: string; limit?: number } = {},
) {
  const { classIds, isPending } = useTeacherScope();

  return useQuery({
    queryKey: queryKeys.teachers.markingQueue({ ...options, classIds }),
    queryFn: () => listPendingSubmissions(classIds, options),
    enabled: !isPending && classIds.length > 0,
    staleTime: 30_000,
  });
}

/**
 * Quiz papers waiting on a human.
 *
 * Kept as its own query rather than merged into the marking queue: the two come
 * from different tables with different policies, and a failure to read one
 * should not blank the other. The grading page interleaves them for display.
 */
export function usePendingAttempts(
  options: { classId?: string; subjectId?: string; limit?: number } = {},
) {
  const { classIds, isPending } = useTeacherScope();

  return useQuery({
    queryKey: queryKeys.teachers.markingQueue({ ...options, classIds, kind: 'quiz' }),
    queryFn: () => listPendingAttempts(classIds, options),
    enabled: !isPending && classIds.length > 0,
    staleTime: 30_000,
  });
}

/** The teacher's own week, across every class they take. */
export function useMyTimetable() {
  const { teacherId, currentSession } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.timetable.forTeacher(teacherId ?? 'none'),
    queryFn: () => getTeacherTimetable(teacherId!, currentSession?.id),
    enabled: Boolean(teacherId),
    // Fixed for the term.
    staleTime: 30 * 60_000,
  });
}
