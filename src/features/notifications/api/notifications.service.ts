import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Notification } from '@/shared/types';

/**
 * Notifications data access.
 *
 * No `user_id` filter anywhere below — `notifications_select_own` already
 * restricts every row to the caller. Adding a redundant `.eq('user_id', …)`
 * would be duplicated authorisation logic that could drift out of step with
 * the policy.
 */

export interface ListOptions {
  unreadOnly?: boolean;
  limit?: number;
}

export async function listNotifications({
  unreadOnly = false,
  limit = 50,
}: ListOptions = {}): Promise<Notification[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq('is_read', false);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data;
}

export async function getUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  if (error) throw toAppError(error);
  return count ?? 0;
}

export async function markAsRead(id: string, isRead = true): Promise<void> {
  // `read_at` is stamped by app.stamp_notification_read(); the column guard in
  // 1300 rejects any other field a client might try to send here.
  const { error } = await supabase.from('notifications').update({ is_read: isRead }).eq('id', id);
  if (error) throw toAppError(error);
}

/** Server-side bulk update — one statement instead of N round trips. */
export async function markAllAsRead(): Promise<number> {
  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw toAppError(error);
  return data;
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw toAppError(error);
}
