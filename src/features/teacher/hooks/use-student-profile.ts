import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useCurrentUser } from '@/features/auth';
import { queryKeys } from '@/shared/lib/query-keys';

import * as api from '../api/student-profile.service';
import { useTeacherScope } from './use-teacher-scope';

export function useStudentProfile(studentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.students.detail(studentId ?? 'none'),
    queryFn: () => api.getStudentProfile(studentId!),
    enabled: Boolean(studentId),
    staleTime: 5 * 60_000,
  });
}

export function useStudentSubmissionHistory(studentId: string | undefined) {
  const { sessionId } = useTeacherScope();

  return useQuery({
    queryKey: queryKeys.students.list({ studentId, view: 'submissions', sessionId }),
    queryFn: () => api.getStudentSubmissions(studentId!, sessionId ?? undefined),
    enabled: Boolean(studentId),
    staleTime: 60_000,
  });
}

export function useStudentAttemptHistory(studentId: string | undefined) {
  const { sessionId } = useTeacherScope();

  return useQuery({
    queryKey: queryKeys.students.list({ studentId, view: 'attempts', sessionId }),
    queryFn: () => api.getStudentAttempts(studentId!, sessionId ?? undefined),
    enabled: Boolean(studentId),
    staleTime: 60_000,
  });
}

export function useStudentNotes(studentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.students.list({ studentId, view: 'notes' }),
    queryFn: () => api.listStudentNotes(studentId!),
    enabled: Boolean(studentId),
    staleTime: 60_000,
  });
}

export function useStudentNoteMutations(studentId: string | undefined) {
  const queryClient = useQueryClient();
  const { school, teacherId } = useCurrentUser();

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.students.list({ studentId, view: 'notes' }),
    });
  };

  const add = useMutation({
    mutationFn: (input: { body: string; isPrivate: boolean; subjectId?: string | null }) =>
      api.addStudentNote({
        school_id: school!.id,
        student_id: studentId!,
        // `teacher_id` is checked against `app.current_teacher_id()` by the
        // insert policy, so it cannot be forged into somebody else's name.
        teacher_id: teacherId,
        subject_id: input.subjectId ?? null,
        body: input.body,
        is_private: input.isPrivate,
      }),
    onSuccess: () => {
      toast.success('Note saved.');
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { body?: string; is_private?: boolean } }) =>
      api.updateStudentNote(id, patch),
    onSuccess: () => {
      toast.success('Note updated.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteStudentNote,
    onSuccess: () => {
      toast.success('Note deleted.');
      invalidate();
    },
  });

  return { add, update, remove };
}
