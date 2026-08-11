import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useCurrentUser } from '@/features/auth';
import { queryKeys } from '@/shared/lib/query-keys';

import * as api from '../api/timetable.service';

/**
 * Timetable reads and writes.
 *
 * Every write invalidates the whole timetable key rather than patching a cell.
 * A claim can fail on a clash the client did not know about — another teacher
 * got there half a second earlier — so the only trustworthy state after a write
 * is the one the server returns. Optimistic cell updates would show a teacher a
 * period they did not get.
 */

export function useSchoolPeriods() {
  const { school } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.timetable.periods(school?.id ?? 'none'),
    queryFn: () => api.listPeriods(school!.id),
    enabled: Boolean(school?.id),
    // The bell schedule changes once a year at most.
    staleTime: 30 * 60_000,
  });
}

export function useClassTimetable(classId: string | undefined, sessionId?: string) {
  return useQuery({
    queryKey: queryKeys.timetable.forClass(classId ?? 'none'),
    queryFn: () => api.getClassTimetable(classId!, sessionId),
    enabled: Boolean(classId),
  });
}

/** The claim grid for one class — what is free, taken, or blocked by my own week. */
export function useAvailability(classId: string | undefined) {
  const { currentSession } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.timetable.availability(classId ?? 'none', currentSession?.id ?? 'none'),
    queryFn: () => api.getAvailability(classId!, currentSession!.id),
    enabled: Boolean(classId && currentSession?.id),
    // Short: somebody else may take a period while this is on screen.
    staleTime: 15_000,
  });
}

export function useClaimMutations(classId: string | undefined) {
  const queryClient = useQueryClient();
  const { user, teacherId, school, currentSession } = useCurrentUser();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.timetable.all });
  };

  const claim = useMutation({
    mutationFn: (input: {
      subjectId: string;
      dayOfWeek: number;
      startsAt: string;
      endsAt: string;
      room?: string | null;
    }) =>
      api.claimPeriod({
        schoolId: school!.id,
        classId: classId!,
        subjectId: input.subjectId,
        teacherId: teacherId!,
        userId: user.id,
        sessionId: currentSession!.id,
        dayOfWeek: input.dayOfWeek,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        room: input.room ?? null,
      }),
    onSuccess: () => {
      toast.success('Period claimed.');
      invalidate();
    },
    onError: () => {
      // `toAppError` already renders 23P01 as a clash; this says who won.
      toast.error('Somebody claimed that period first. The grid has been refreshed.');
      invalidate();
    },
    meta: { silenceErrorToast: true },
  });

  const release = useMutation({
    mutationFn: api.releaseSlot,
    onSuccess: () => {
      toast.success('Period released.');
      invalidate();
    },
  });

  return { claim, release };
}

/** The office's editor. Administrators only — the policies decide, not this. */
export function useTimetableAdmin(classId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.timetable.all });
  };

  const place = useMutation({
    mutationFn: api.placeSlot,
    onSuccess: () => {
      toast.success('Lesson placed.');
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateSlot>[1] }) =>
      api.updateSlot(id, patch),
    onSuccess: () => {
      toast.success('Timetable updated.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteSlot,
    onSuccess: () => {
      toast.success('Lesson cleared.');
      invalidate();
    },
  });

  return { place, update, remove, classId };
}

export function useEligibleTeachers(
  classId: string | undefined,
  subjectId: string | undefined,
  sessionId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.timetable.eligibleTeachers(classId ?? 'none', subjectId ?? 'none'),
    queryFn: () => api.listEligibleTeachers(classId!, subjectId!, sessionId!),
    enabled: Boolean(classId && subjectId && sessionId),
    staleTime: 5 * 60_000,
  });
}

export function usePeriodMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.timetable.all });
  };

  const save = useMutation({
    mutationFn: api.upsertPeriod,
    onSuccess: () => {
      toast.success('Bell schedule saved.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.deletePeriod,
    onSuccess: () => {
      toast.success('Period removed.');
      invalidate();
    },
  });

  return { save, remove };
}
