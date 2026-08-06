import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import {
  createSignedUrl,
  deleteFile as deleteStorageFile,
  paths,
  uploadAndRegister,
} from '@/shared/services/storage.service';
import type { Lesson, StoredFile, TablesInsert, TablesUpdate } from '@/shared/types';

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

/**
 * Back to draft.
 *
 * `published_at` is deliberately kept. It records when the lesson first went
 * out, which is still true after it is withdrawn — and clearing it would let a
 * teacher quietly rewrite a lesson pupils have already read and republish it as
 * though it were new.
 */
export async function unpublishLesson(id: string): Promise<Lesson> {
  return updateLesson(id, { status: 'draft' });
}

export async function deleteLesson(id: string): Promise<void> {
  const { error } = await supabase.from('lessons').delete().eq('id', id);
  if (error) throw toAppError(error);
}

// ── Attachments ─────────────────────────────────────────────────────────────
//  Held in `files` with `entity_type = 'lesson'`, and in the `lesson-materials`
//  bucket under {school_id}/{class_id}/{lesson_id}/{filename}. The storage
//  policies read those path segments as the access key — see 1100_storage.sql —
//  so the path grammar is a security boundary, not a naming convention. It is
//  built by `paths.lessonMaterial()` and nowhere else.

export type LessonAttachment = Pick<
  StoredFile,
  'id' | 'bucket' | 'path' | 'original_name' | 'mime_type' | 'size_bytes' | 'created_at'
>;

export async function listLessonAttachments(lessonId: string): Promise<LessonAttachment[]> {
  const { data, error } = await supabase
    .from('files')
    .select('id, bucket, path, original_name, mime_type, size_bytes, created_at')
    .eq('entity_type', 'lesson')
    .eq('entity_id', lessonId)
    .order('created_at', { ascending: true });

  if (error) throw toAppError(error);
  return data;
}

export async function attachToLesson(args: {
  lessonId: string;
  classId: string;
  schoolId: string;
  ownerId: string;
  file: File;
}): Promise<void> {
  await uploadAndRegister({
    bucket: 'lesson-materials',
    path: paths.lessonMaterial(args.schoolId, args.classId, args.lessonId, args.file.name),
    file: args.file,
    schoolId: args.schoolId,
    ownerId: args.ownerId,
    entityType: 'lesson',
    entityId: args.lessonId,
    // The whole class needs to open it; the storage policy already confines
    // that to pupils who can read the class.
    visibility: 'class',
  });
}

/**
 * Remove an attachment.
 *
 * The object goes first. If the metadata row were deleted first and the object
 * delete then failed, the file would be orphaned in the bucket with nothing
 * pointing at it — invisible to the UI and impossible to clean up without a
 * storage audit. This order can leave a dangling `files` row instead, which is
 * visible and fixable.
 */
export async function removeLessonAttachment(file: LessonAttachment): Promise<void> {
  await deleteStorageFile(file.bucket, file.path);

  const { error } = await supabase.from('files').delete().eq('id', file.id);
  if (error) throw toAppError(error);
}

/** A short-lived download link. Never cached — see storage.service. */
export async function lessonAttachmentUrl(file: LessonAttachment): Promise<string> {
  return createSignedUrl(file.bucket, file.path);
}
