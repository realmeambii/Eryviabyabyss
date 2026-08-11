import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/features/auth';
import { queryKeys } from '@/shared/lib/query-keys';

import * as api from '../api/parent.service';

/**
 * Guardian reads.
 *
 * All of them are keyed on the child, not on the guardian, so switching between
 * siblings swaps a cache entry rather than refetching the same rows under a
 * different name.
 */

export function useChildDetail(studentId: string | undefined) {
  const { currentSession } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.parents.child(studentId ?? 'none', currentSession?.id ?? 'none'),
    queryFn: () => api.getChildDetail(studentId!, currentSession!.id),
    enabled: Boolean(studentId && currentSession?.id),
    staleTime: 5 * 60_000,
  });
}

export function useChildWork(studentId: string | undefined, classId: string | null | undefined) {
  const { currentSession } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.parents.work(studentId ?? 'none', classId ?? 'none'),
    queryFn: () =>
      api.getChildWork({
        studentId: studentId!,
        classId: classId!,
        sessionId: currentSession!.id,
      }),
    enabled: Boolean(studentId && classId && currentSession?.id),
    staleTime: 60_000,
  });
}

export function useChildQuizzes(studentId: string | undefined, classId: string | null | undefined) {
  const { currentSession } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.parents.quizzes(studentId ?? 'none', classId ?? 'none'),
    queryFn: () =>
      api.getChildQuizzes({
        studentId: studentId!,
        classId: classId!,
        sessionId: currentSession!.id,
      }),
    enabled: Boolean(studentId && classId && currentSession?.id),
    staleTime: 60_000,
  });
}
