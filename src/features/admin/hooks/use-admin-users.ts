import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useCurrentUser } from '@/features/auth';
import type { MutationMeta } from '@/shared/lib/query-client';
import { queryKeys } from '@/shared/lib/query-keys';

import * as usersApi from '../api/users.service';
import type { ProvisionableRole } from '../api/users.service';

/**
 * Admin people hooks.
 *
 * Provisioning touches four caches at once — a new student is a row in
 * `users`, in `students`, in `enrollments` and a number on the dashboard tiles —
 * so every mutation here invalidates the lot rather than trying to reason about
 * which lists a given action happened to change. These are small lists and the
 * refetch is one round trip; a cache that quietly disagrees with the database
 * about who exists is a far more expensive bug.
 */

function useInvalidatePeople() {
  const queryClient = useQueryClient();

  return () => {
    for (const key of [
      queryKeys.users.all,
      queryKeys.students.all,
      queryKeys.teachers.all,
      queryKeys.parents.all,
      // An administrator is provisioned through the same path, and their list
      // is its own cache — without this the founder adds a colleague and the
      // page they added them from does not change.
      queryKeys.administrators.all,
      // The dashboard counts every one of those.
      queryKeys.school.all,
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

// ── Directories ─────────────────────────────────────────────────────────────

export function useTeachers() {
  const { school } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.teachers.list({ schoolId: school?.id }),
    queryFn: usersApi.listTeachers,
    enabled: Boolean(school?.id),
    staleTime: 60_000,
  });
}

export function useParents() {
  const { school } = useCurrentUser();

  return useQuery({
    queryKey: queryKeys.parents.all,
    queryFn: usersApi.listParents,
    enabled: Boolean(school?.id),
    staleTime: 60_000,
  });
}

/** The whole roll, for the guardian picker. Only fetched once a dialog opens. */
export function useStudentOptions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.students.list({ picker: true }),
    queryFn: usersApi.listStudentOptions,
    enabled,
    staleTime: 5 * 60_000,
  });
}

// ── Provisioning ────────────────────────────────────────────────────────────

const ROLE_NOUN: Record<ProvisionableRole, string> = {
  student: 'Student',
  teacher: 'Teacher',
  parent: 'Parent',
  administrator: 'Administrator',
};

export function useUserProvisioning() {
  const invalidate = useInvalidatePeople();

  /**
   * Two departures from the house style, both deliberate.
   *
   * No success toast: the caller has to render the temporary password, and a
   * toast saying "done" while a one-time credential is still on screen invites
   * the administrator to close the dialog before copying it.
   *
   * No error toast either. The failures here are field-specific — a duplicate
   * admission number, an address already in use — and belong beside the form
   * that produced them, not in a notification that fades while the form is
   * still open. The dialog renders `create.error` itself.
   */
  const create = useMutation({
    meta: { silenceErrorToast: true } satisfies MutationMeta,
    mutationFn: usersApi.createUserAccount,
    onSuccess: (account) => {
      invalidate();
      if (!account.welcomeEmailSent) return;
      toast.success(`${ROLE_NOUN[account.role]} created. A welcome email is on its way.`);
    },
  });

  const resetPassword = useMutation({
    mutationFn: usersApi.resetUserPassword,
    onSuccess: (result) => {
      if (result.mode === 'email') {
        toast.success('A reset link has been emailed to them.');
      }
    },
  });

  const setStatus = useMutation({
    mutationFn: usersApi.setUserStatus,
    onSuccess: (result) => {
      toast.success(
        result.status === 'suspended'
          ? 'Account deactivated. They are signed out and cannot sign back in.'
          : 'Account reactivated.',
      );
      invalidate();
    },
  });

  return { create, resetPassword, setStatus };
}

// ── Record edits and guardian links ─────────────────────────────────────────

export function useTeacherMutations() {
  const invalidate = useInvalidatePeople();

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof usersApi.updateTeacherRecord>[1];
    }) => usersApi.updateTeacherRecord(id, patch),
    onSuccess: () => {
      toast.success('Staff record updated.');
      invalidate();
    },
  });

  return { update };
}

export function useParentMutations() {
  const invalidate = useInvalidatePeople();
  const { school } = useCurrentUser();

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof usersApi.updateParentRecord>[1];
    }) => usersApi.updateParentRecord(id, patch),
    onSuccess: () => {
      toast.success('Guardian record updated.');
      invalidate();
    },
  });

  const linkChild = useMutation({
    mutationFn: (args: Omit<Parameters<typeof usersApi.linkChild>[0], 'schoolId'>) =>
      usersApi.linkChild({ ...args, schoolId: school!.id }),
    onSuccess: () => {
      toast.success('Child linked.');
      invalidate();
    },
  });

  const unlinkChild = useMutation({
    mutationFn: usersApi.unlinkChild,
    onSuccess: () => {
      toast.success('Child unlinked.');
      invalidate();
    },
  });

  return { update, linkChild, unlinkChild };
}
