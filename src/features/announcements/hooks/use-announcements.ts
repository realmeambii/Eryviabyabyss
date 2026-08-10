import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { queryKeys } from '@/shared/lib/query-keys';

import * as api from '../api/announcements.service';

/**
 * Noticeboard hooks.
 *
 * Publishing fires `app.notify_on_announcement_published()`, which fans a
 * notification out to the whole audience in the same statement. So publishing
 * invalidates notifications as well — the bell badge is downstream of this
 * write, not of a separate one.
 */

export function useAnnouncements(filters: api.AnnouncementFilters = {}) {
  return useQuery({
    queryKey: queryKeys.announcements.list(filters as Record<string, unknown>),
    queryFn: () => api.listAnnouncements(filters),
    staleTime: 60_000,
  });
}

export function useAnnouncementMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  };

  const create = useMutation({
    mutationFn: api.createAnnouncement,
    onSuccess: (announcement) => {
      toast.success(
        announcement.status === 'published'
          ? 'Posted. Everyone in the audience has been notified.'
          : 'Saved as a draft.',
      );
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof api.updateAnnouncement>[1];
    }) => api.updateAnnouncement(id, patch),
    onSuccess: () => {
      toast.success('Announcement updated.');
      invalidate();
    },
  });

  const publish = useMutation({
    mutationFn: api.publishAnnouncement,
    onSuccess: () => {
      toast.success('Posted. Everyone in the audience has been notified.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteAnnouncement,
    onSuccess: () => {
      toast.success('Announcement deleted.');
      invalidate();
    },
  });

  return { create, update, publish, remove };
}
