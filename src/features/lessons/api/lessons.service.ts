import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Lesson, TablesInsert, TablesUpdate } from '@/shared/types';

/**
 * Lessons data access.
 *
 * `lessons_select_authorised` returns published lessons to anyone who can read
 * the class, and drafts only to the teacher who owns the class-subject. So a
 * student calling `listLessons` sees the syllabus as published — no status
 * filter is needed here, and adding one would be a second copy of the rule.
 */

export type LessonWithAuthor = Lesson & {
  created_by_teacher: { id: string; user: { full_name: string } | null } | null;
};

const SELECT = `*,
  created_by_teacher:teachers!lessons_created_by_fkey (
    id, user:users!teachers_user_id_fkey (full_name)
  )`;

/**
 * Every filter is optional.
 *
 * The student course view always passes both a class and a subject — it is
 * looking at one syllabus. A teacher's subject page asks a different question:
 * "every lesson I have written for Physics, whichever class it was for". RLS
 * confines an unfiltered read to what the caller may see either way.
 */
export interface LessonFilters {
  classId?: string;
  subjectId?: string;
  sessionId?: string;
  status?: Lesson['status'];
  limit?: number;
}

export async function listLessons({
  classId,
  subjectId,
  sessionId,
  status,
  limit,
}: LessonFilters = {}): Promise<LessonWithAuthor[]> {
  let query = supabase
    .from('lessons')
    .select(SELECT)
    .order('week_number', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true });

  if (classId) query = query.eq('class_id', classId);
  if (subjectId) query = query.eq('subject_id', subjectId);
  if (status) query = query.eq('status', status);
  if (limit) query = query.limit(limit);
  if (sessionId) query = query.eq('academic_session_id', sessionId);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data as unknown as LessonWithAuthor[];
}

export async function getLesson(id: string): Promise<LessonWithAuthor> {
  const { data, error } = await supabase.from('lessons').select(SELECT).eq('id', id).single();
  if (error) throw toAppError(error);
  return data as unknown as LessonWithAuthor;
}

export async function createLesson(input: TablesInsert<'lessons'>): Promise<Lesson> {
  const { data, error } = await supabase.from('lessons').insert(input).select().single();
  if (error) throw toAppError(error);
  return data;
}

export async function updateLesson(id: string, patch: TablesUpdate<'lessons'>): Promise<Lesson> {
  const { data, error } = await supabase
    .from('lessons')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/** `lessons_published_has_timestamp` requires published_at, so set both. */
export async function publishLesson(id: string): Promise<Lesson> {
  return updateLesson(id, { status: 'published', published_at: new Date().toISOString() });
}

export async function deleteLesson(id: string): Promise<void> {
  const { error } = await supabase.from('lessons').delete().eq('id', id);
  if (error) throw toAppError(error);
}
