import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Announcement, TablesInsert, TablesUpdate } from '@/shared/types';

/**
 * Announcements data access.
 *
 * The audience rules — school-wide, a class, a role, one person, plus the
 * publish window — are all in `announcements_select_audience`. This file never
 * filters on audience: doing so would duplicate a four-branch policy in
 * TypeScript, and the copy would be the one that goes stale.
 *
 * What it does filter on is presentation: pinned first, newest next.
 */

export type AnnouncementWithAuthor = Announcement & {
  author: { id: string; full_name: string; avatar_path: string | null } | null;
  class: { id: string; name: string; arm: string } | null;
};

const SELECT = `*,
  author:users!announcements_author_id_fkey (id, full_name, avatar_path),
  class:classes!announcements_class_id_fkey (id, name, arm)`;

export interface AnnouncementFilters {
  classId?: string;
  limit?: number;
  /** Restrict to a single audience kind — used by the class noticeboard tab. */
  audience?: Announcement['audience'];
}

export async function listAnnouncements({
  classId,
  limit = 50,
  audience,
}: AnnouncementFilters = {}): Promise<AnnouncementWithAuthor[]> {
  let query = supabase
    .from('announcements')
    .select(SELECT)
    .order('is_pinned', { ascending: false })
    .order('publish_at', { ascending: false })
    .limit(limit);

  if (classId) query = query.eq('class_id', classId);
  if (audience) query = query.eq('audience', audience);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data;
}

export async function getAnnouncement(id: string): Promise<AnnouncementWithAuthor> {
  const { data, error } = await supabase.from('announcements').select(SELECT).eq('id', id).single();
  if (error) throw toAppError(error);
  return data;
}

export async function createAnnouncement(
  input: TablesInsert<'announcements'>,
): Promise<Announcement> {
  const { data, error } = await supabase.from('announcements').insert(input).select().single();
  if (error) throw toAppError(error);
  return data;
}

export async function updateAnnouncement(
  id: string,
  patch: TablesUpdate<'announcements'>,
): Promise<Announcement> {
  const { data, error } = await supabase
    .from('announcements')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/**
 * Publishing is what triggers the fan-out: `notify_on_announcement_published`
 * writes a notification row for every member of the audience.
 */
export async function publishAnnouncement(id: string): Promise<Announcement> {
  return updateAnnouncement(id, { status: 'published', publish_at: new Date().toISOString() });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw toAppError(error);
}
