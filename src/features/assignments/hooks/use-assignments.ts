import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useCurrentUser } from '@/features/auth';
import { queryKeys } from '@/shared/lib/query-keys';

import * as api from '../api/assignments.service';

/**
 * Teacher-side assignment hooks.
 *
 * Grading invalidates `grades` as well as the submission board, because
 * `app.sync_grade_from_submission()` writes a gradebook row from the same
 * update. A cache that only knew about submissions would leave the gradebook
 * showing yesterday's marks with no clue why.
 */

export function useAssignments(filters: api.AssignmentFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.assignments.list(filters as Record<string, unknown>),
    queryFn: () => api.listAssignments(filters),
    enabled,
    staleTime: 60_000,
  });
}

export function useAssignment(assignmentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assignments.detail(assignmentId ?? 'none'),
    queryFn: () => api.getAssignment(assignmentId!),
    enabled: Boolean(assignmentId),
    staleTime: 60_000,
  });
}

export function useSubmissionBoard(args: {
  assignmentId: string | undefined;
  classId: string | undefined;
  sessionId: string | null;
}) {
  return useQuery({
    queryKey: queryKeys.assignments.submissions(args.assignmentId ?? 'none'),
    queryFn: () =>
      api.getSubmissionBoard({
        assignmentId: args.assignmentId!,
        classId: args.classId!,
        sessionId: args.sessionId!,
      }),
    enabled: Boolean(args.assignmentId && args.classId && args.sessionId),
    // Pupils hand in while a teacher has the board open.
    staleTime: 20_000,
  });
}

export function useAssignmentAttachments(assignmentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.files.forEntity('assignment', assignmentId ?? 'none'),
    queryFn: () => api.listAssignmentAttachments(assignmentId!),
    enabled: Boolean(assignmentId),
    staleTime: 60_000,
  });
}

export function useSubmissionAttachments(submissionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.files.forEntity('assignment_submission', submissionId ?? 'none'),
    queryFn: () => api.listSubmissionAttachments(submissionId!),
    enabled: Boolean(submissionId),
    staleTime: 60_000,
  });
}

export function useAssignmentMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
  };

  const create = useMutation({
    mutationFn: api.createAssignment,
    onSuccess: (assignment) => {
      toast.success(`“${assignment.title}” saved as a draft.`);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof api.updateAssignment>[1];
    }) => api.updateAssignment(id, patch),
    onSuccess: () => {
      invalidate();
    },
  });

  const publish = useMutation({
    mutationFn: api.publishAssignment,
    onSuccess: (assignment) => {
      // Publishing fires `notify_class_on_assignment_publish`, so the class is
      // told at the same moment. Worth saying out loud — it is not undoable.
      toast.success(`“${assignment.title}” published. The class has been notified.`);
      invalidate();
    },
  });

  const unpublish = useMutation({
    mutationFn: (id: string) => api.updateAssignment(id, { status: 'draft' }),
    onSuccess: () => {
      toast.success('Back to a draft. Pupils can no longer see it or hand in.');
      invalidate();
    },
  });

  const close = useMutation({
    mutationFn: (id: string) => api.updateAssignment(id, { status: 'closed' }),
    onSuccess: () => {
      toast.success('Closed. No further submissions are accepted.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteAssignment,
    onSuccess: () => {
      toast.success('Assignment deleted.');
      invalidate();
    },
  });

  return { create, update, publish, unpublish, close, remove };
}

export function useGrading(assignmentId: string | undefined) {
  const queryClient = useQueryClient();
  // `graded_by` is a foreign key to `teachers`, not `users`. The teacher id is
  // what the column wants; `user.id` fails on the foreign key.
  const { teacherId } = useCurrentUser();

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.assignments.submissions(assignmentId ?? 'none'),
    });
    // The gradebook row is written by a trigger on the same update.
    void queryClient.invalidateQueries({ queryKey: queryKeys.grades.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.teachers.all });
  };

  const grade = useMutation({
    mutationFn: ({
      submissionId,
      score,
      feedback,
    }: {
      submissionId: string;
      score: number;
      feedback?: string | null;
    }) => api.gradeSubmission(submissionId, { score, feedback, gradedByTeacherId: teacherId! }),
    onSuccess: () => {
      toast.success('Mark saved.');
      invalidate();
    },
  });

  const bulkGrade = useMutation({
    mutationFn: (entries: api.BulkGradeEntry[]) => api.bulkGradeSubmissions(entries, teacherId!),
    onSuccess: (result) => {
      if (result.failures.length === 0) {
        toast.success(`${result.graded} ${result.graded === 1 ? 'mark' : 'marks'} saved.`);
      } else {
        // Partial success is the normal outcome of a bad score in one row, and
        // saying "saved" would hide the pupils who were skipped.
        toast.warning(
          `${result.graded} saved, ${result.failures.length} rejected. Check the highlighted rows.`,
        );
      }
      invalidate();
    },
  });

  const returnToStudent = useMutation({
    mutationFn: api.returnSubmission,
    onSuccess: () => {
      toast.success('Returned to the pupil.');
      invalidate();
    },
  });

  return { grade, bulkGrade, returnToStudent };
}

export function useAssignmentAttachmentMutations(assignmentId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.files.forEntity('assignment', assignmentId ?? 'none'),
    });
  };

  const attach = useMutation({
    mutationFn: api.attachToAssignment,
    onSuccess: () => {
      toast.success('Attachment uploaded.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.removeAssignmentAttachment,
    onSuccess: () => {
      toast.success('Attachment removed.');
      invalidate();
    },
  });

  return { attach, remove };
}
