import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useCurrentUser } from '@/features/auth';
import { useRealtime } from '@/shared/hooks';
import { queryKeys } from '@/shared/lib/query-keys';

import * as api from '../api/messages.service';

/**
 * Messaging hooks.
 *
 * Realtime is what makes this a conversation rather than a form. `messages` is
 * in the `supabase_realtime` publication and Realtime re-evaluates RLS per
 * subscriber, so a broadcast only reaches participants who could already have
 * selected the row — the subscription needs no access check of its own.
 */

export function useConversations() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  // One subscription for the whole inbox: any new message anywhere reorders
  // the list and moves an unread count, so there is nothing to filter on.
  useRealtime({
    table: 'messages',
    event: 'INSERT',
    invalidate: [queryKeys.messages.all],
  });

  return useQuery({
    queryKey: queryKeys.messages.conversations(),
    queryFn: () => api.listConversations(user.id),
    staleTime: 30_000,
    // Keep the inbox honest while a thread is open in another tab.
    refetchOnWindowFocus: true,
    ...(queryClient ? {} : {}),
  });
}

export function useMessages(conversationId: string | undefined) {
  useRealtime({
    table: 'messages',
    event: '*',
    filter: conversationId ? `conversation_id=eq.${conversationId}` : undefined,
    invalidate: [queryKeys.messages.thread(conversationId ?? 'none'), queryKeys.messages.all],
    enabled: Boolean(conversationId),
  });

  return useQuery({
    queryKey: queryKeys.messages.thread(conversationId ?? 'none'),
    queryFn: () => api.listMessages(conversationId!),
    enabled: Boolean(conversationId),
    staleTime: 15_000,
  });
}

export function useCorrespondents(enabled = true) {
  return useQuery({
    queryKey: queryKeys.messages.correspondents(),
    queryFn: api.listCorrespondents,
    enabled,
    // Who you may write to changes when timetables change, not minute to minute.
    staleTime: 5 * 60_000,
  });
}

export function useConversationAttachments(conversationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.files.forEntity('message', conversationId ?? 'none'),
    queryFn: () => api.listConversationAttachments(conversationId!),
    enabled: Boolean(conversationId),
    staleTime: 60_000,
  });
}

export function useMessageMutations(conversationId?: string) {
  const queryClient = useQueryClient();
  const { user, school } = useCurrentUser();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.messages.all });
  };

  const send = useMutation({
    mutationFn: (body: string) =>
      api.sendMessage({
        conversationId: conversationId!,
        schoolId: school!.id,
        senderId: user.id,
        body,
      }),
    // No success toast. A toast for every line you type is noise — the message
    // appearing in the thread is the confirmation.
    onSuccess: invalidate,
  });

  const start = useMutation({
    mutationFn: (input: { withUserIds: string[]; subject: string | null; firstMessage: string }) =>
      api.startConversation({
        ...input,
        schoolId: school!.id,
        myUserId: user.id,
      }),
    onSuccess: () => {
      toast.success('Conversation started.');
      invalidate();
    },
  });

  const withdraw = useMutation({
    mutationFn: api.withdrawMessage,
    onSuccess: () => {
      toast.success('Message withdrawn. The school still holds a record of it.');
      invalidate();
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.markRead(id, user.id),
    // Silent, and no invalidate: marking read fires on opening a thread, and a
    // refetch there would rerender the messages the reader is looking at.
    // The next natural refresh picks up the new watermark.
  });

  const attach = useMutation({
    mutationFn: (file: File) =>
      api.attachToConversation({
        conversationId: conversationId!,
        schoolId: school!.id,
        ownerId: user.id,
        file,
      }),
    onSuccess: () => {
      toast.success('Attachment sent.');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.files.forEntity('message', conversationId ?? 'none'),
      });
    },
  });

  return { send, start, withdraw, markRead, attach };
}
