import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import { useRealtime } from '@/shared/hooks/use-realtime';
import { queryKeys } from '@/shared/lib/query-keys';

import * as service from '../api/notifications.service';

/**
 * The unread badge.
 *
 * A count query plus a Realtime subscription filtered to this user's rows, so
 * a grade posted by a teacher lights the bell without a poll. Realtime applies
 * the same RLS as a SELECT, so the filter is a bandwidth optimisation rather
 * than the thing keeping other people's notifications out.
 */
export function useUnreadNotificationCount(): number {
  const { session, isAuthenticated } = useAuth();
  const userId = session?.user.id;

  const query = useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: service.getUnreadCount,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  useRealtime({
    table: 'notifications',
    filter: userId ? `user_id=eq.${userId}` : undefined,
    enabled: Boolean(userId),
    invalidate: [queryKeys.notifications.all],
  });

  return query.data ?? 0;
}

export function useNotifications(options: service.ListOptions = {}) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.notifications.list(options as Record<string, unknown>),
    queryFn: () => service.listNotifications(options),
    enabled: isAuthenticated,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isRead = true }: { id: string; isRead?: boolean }) =>
      service.markAsRead(id, isRead),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: service.markAllAsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: service.deleteNotification,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
