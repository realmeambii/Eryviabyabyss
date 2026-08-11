import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/features/auth';
import { queryKeys } from '@/shared/lib/query-keys';

import * as api from '../api/administrators.service';

/**
 * The signed-in administrator's own capabilities.
 *
 * Used to decide what the interface offers, never what the database allows.
 * Cached for the session: a capability change forces the affected person's next
 * write to fail loudly rather than silently succeeding, which is the safe
 * direction for a stale read to fail in.
 */
export function useMyCapabilities() {
  const { isAdministrator } = useAuth();

  return useQuery({
    queryKey: queryKeys.administrators.mine(),
    queryFn: api.getMyCapabilities,
    enabled: isAdministrator,
    staleTime: 5 * 60_000,
  });
}

/** True when the signed-in administrator holds a capability. False while loading. */
export function useCan(capability: api.Capability): boolean {
  const { data } = useMyCapabilities();
  if (!data?.isAdministrator) return false;
  return data.isSuper || data.capabilities.includes(capability);
}

export function useAdministrators(enabled = true) {
  const { isAdministrator } = useAuth();

  return useQuery({
    queryKey: queryKeys.administrators.list(),
    queryFn: api.listAdministrators,
    enabled: enabled && isAdministrator,
    staleTime: 60_000,
  });
}

export function useAdministratorMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.administrators.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  };

  const setCapabilities = useMutation({
    mutationFn: ({ grantId, capabilities }: { grantId: string; capabilities: api.Capability[] }) =>
      api.setCapabilities(grantId, capabilities),
    onSuccess: (result) => {
      // A null result is RLS returning no rows, not a failure the client can
      // see in `error`. Saying "saved" there would be a lie.
      if (result === null) {
        toast.error('Only the founding administrator can change these.');
      } else {
        toast.success('Permissions updated.');
      }
      invalidate();
    },
  });

  const revoke = useMutation({
    mutationFn: api.revokeAdministrator,
    onSuccess: () => {
      toast.success('Administrator access removed. The account itself is untouched.');
      invalidate();
    },
  });

  return { setCapabilities, revoke };
}
