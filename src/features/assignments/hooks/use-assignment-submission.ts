import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useCurrentUser } from '@/features/auth';
import { queryKeys } from '@/shared/lib/query-keys';
import { paths, uploadAndRegister } from '@/shared/services/storage.service';
import type { Assignment } from '@/shared/types';

import { submitAssignment } from '../api/assignments.service';

export interface SubmitInput {
  assignment: Pick<Assignment, 'id' | 'school_id'>;
  studentId: string;
  content: string;
  files: File[];
  /** Draft keeps it editable; submitted starts the clock on the teacher. */
  asDraft?: boolean;
}

/**
 * Hand in work.
 *
 * Order matters: files upload first, the row is written last. If an upload
 * fails the submission does not exist, which is recoverable — the student
 * retries. The reverse order would leave a submitted assignment with missing
 * attachments and no obvious way to notice.
 *
 * Neither `submitted_at` nor `is_late` is sent. `app.enforce_submission_rules()`
 * sets both from the database clock, so a student cannot un-late a submission
 * by changing their computer's date. The same trigger rejects the write
 * outright once `closes_at` has passed, and that rejection surfaces here as a
 * plain message rather than a constraint dump.
 */
export function useSubmitAssignment() {
  const queryClient = useQueryClient();
  const { school } = useCurrentUser();

  return useMutation({
    mutationFn: async ({ assignment, studentId, content, files, asDraft }: SubmitInput) => {
      const schoolId = school?.id ?? assignment.school_id;

      for (const file of files) {
        await uploadAndRegister({
          bucket: 'assignment-uploads',
          path: paths.submission(schoolId, assignment.id, studentId, file.name),
          file,
          schoolId,
          ownerId: studentId,
          entityType: 'assignment_submission',
          entityId: assignment.id,
          visibility: 'private',
        });
      }

      return submitAssignment({
        assignment_id: assignment.id,
        student_id: studentId,
        school_id: schoolId,
        content,
        status: asDraft ? 'draft' : 'submitted',
      });
    },

    onSuccess: (_result, variables) => {
      toast.success(variables.asDraft ? 'Draft saved.' : 'Submitted. Your teacher can see it now.');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.assignments.mySubmission(variables.assignment.id),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.files.all });
    },
  });
}
