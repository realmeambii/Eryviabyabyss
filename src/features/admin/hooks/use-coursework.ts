import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/features/auth';
import { queryKeys } from '@/shared/lib/query-keys';

import { listCoursework } from '../api/coursework.service';

/** What has been set across the school this term. Read only. */
export function useCoursework(args: {
  kind: 'assignments' | 'quizzes';
  classId?: string;
  subjectId?: string;
}) {
  const { currentSession } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.admin.coursework(currentSession?.id ?? 'none', args),
    queryFn: () =>
      listCoursework({
        kind: args.kind,
        sessionId: currentSession!.id,
        classId: args.classId,
        subjectId: args.subjectId,
      }),
    enabled: Boolean(currentSession?.id),
    staleTime: 60_000,
  });
}
