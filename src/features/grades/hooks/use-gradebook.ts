import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useCurrentUser } from '@/features/auth';
import { queryKeys } from '@/shared/lib/query-keys';

import * as api from '../api/grades.service';
import * as resultsApi from '../api/results.service';

/**
 * Teacher gradebook hooks.
 *
 * Everything invalidates `grades` wholesale. The gradebook is the one screen
 * where a stale number is not a cosmetic problem — a teacher reading last
 * minute's average and publishing on it has published the wrong thing.
 */

function useInvalidateGrades() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.grades.all });
    // Class statistics on the teacher pages are computed from the same rows.
    void queryClient.invalidateQueries({ queryKey: queryKeys.teachers.all });
  };
}

export function useClassGradebook(args: {
  classId: string | undefined;
  subjectId: string | undefined;
  sessionId: string | null;
  weighting?: api.ReportWeighting;
}) {
  return useQuery({
    queryKey: queryKeys.grades.forClass(args.classId ?? 'none', args.subjectId),
    queryFn: () =>
      api.getClassGradebook({
        classId: args.classId!,
        subjectId: args.subjectId!,
        sessionId: args.sessionId!,
        weighting: args.weighting,
      }),
    enabled: Boolean(args.classId && args.subjectId && args.sessionId),
    staleTime: 30_000,
  });
}

export function useStudentGrades(
  studentId: string | undefined,
  filters: api.StudentGradeFilters = {},
) {
  return useQuery({
    queryKey: queryKeys.grades.forStudent(studentId ?? 'none', filters.sessionId),
    queryFn: () => api.listStudentGrades(studentId!, filters),
    enabled: Boolean(studentId),
    staleTime: 60_000,
  });
}

export function useGradeMutations() {
  const invalidate = useInvalidateGrades();
  const { teacherId } = useCurrentUser();

  const record = useMutation({
    mutationFn: (input: Omit<Parameters<typeof api.recordGrade>[0], 'recorded_by'>) =>
      // `recorded_by` is a foreign key to `teachers`, like `graded_by`.
      api.recordGrade({ ...input, recorded_by: teacherId }),
    onSuccess: () => {
      toast.success('Mark recorded.');
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateGrade>[1] }) =>
      api.updateGrade(id, patch),
    onSuccess: () => {
      toast.success('Mark updated.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteGrade,
    onSuccess: () => {
      toast.success('Mark withdrawn.');
      invalidate();
    },
  });

  const setPublished = useMutation({
    mutationFn: ({ ids, published }: { ids: string[]; published: boolean }) =>
      api.setGradesPublished(ids, published),
    onSuccess: (_result, variables) => {
      toast.success(
        variables.published
          ? `${variables.ids.length} ${variables.ids.length === 1 ? 'mark' : 'marks'} published. Pupils can see them now.`
          : 'Marks withheld from pupils.',
      );
      invalidate();
    },
  });

  const importCsv = useMutation({
    mutationFn: (args: Omit<Parameters<typeof api.importGrades>[0], 'recordedByTeacherId'>) =>
      api.importGrades({ ...args, recordedByTeacherId: teacherId! }),
    onSuccess: (outcome) => {
      if (outcome.skipped.length === 0) {
        toast.success(`${outcome.imported} marks imported, unpublished.`);
      } else {
        toast.warning(`${outcome.imported} imported, ${outcome.skipped.length} skipped.`);
      }
      invalidate();
    },
  });

  return { record, update, remove, setPublished, importCsv };
}

// ── School-wide results ─────────────────────────────────────────────────────

export function useSchoolResults(filters: {
  classId?: string;
  subjectId?: string;
  enabled?: boolean;
}) {
  const { currentSession } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.grades.school(currentSession?.id ?? 'none', {
      classId: filters.classId,
      subjectId: filters.subjectId,
    }),
    queryFn: () =>
      resultsApi.getSchoolResults({
        sessionId: currentSession!.id,
        classId: filters.classId,
        subjectId: filters.subjectId,
      }),
    enabled: (filters.enabled ?? true) && Boolean(currentSession?.id),
    staleTime: 60_000,
  });
}

export function useReportCards(classId: string | undefined) {
  const { currentSession } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.grades.reportCards(classId ?? 'none', currentSession?.id ?? 'none'),
    queryFn: () => resultsApi.getReportCards({ classId: classId!, sessionId: currentSession!.id }),
    enabled: Boolean(classId && currentSession?.id),
    staleTime: 60_000,
  });
}

/**
 * Publish or withhold in bulk.
 *
 * Publication is what a pupil's `grades_select` policy turns on, so this is a
 * real action with a real audience — not a display flag. The confirmation says
 * how many rows and to whom.
 */
export function useResultPublication() {
  const invalidate = useInvalidateGrades();

  const publish = useMutation({
    mutationFn: ({ ids, published }: { ids: string[]; published: boolean }) =>
      api.setGradesPublished(ids, published),
    onSuccess: (_result, variables) => {
      const count = variables.ids.length;
      toast.success(
        variables.published
          ? `${count} ${count === 1 ? 'result is' : 'results are'} now visible to pupils and guardians.`
          : `${count} ${count === 1 ? 'result' : 'results'} withheld. Pupils can no longer see ${count === 1 ? 'it' : 'them'}.`,
      );
      invalidate();
    },
  });

  return { publish };
}
