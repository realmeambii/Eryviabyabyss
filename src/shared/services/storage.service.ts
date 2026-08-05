import { supabase } from '@/shared/lib/supabase';
import { AppError, toAppError } from '@/shared/lib/errors';
import { SIGNED_URL_TTL_SECONDS, UPLOAD_LIMITS } from '@/shared/lib/constants';
import type { StorageBucket, TablesInsert } from '@/shared/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Storage — the only place in the app that builds an object path.
 * ═══════════════════════════════════════════════════════════════════════════
 *  The policies in `20260801001100_storage.sql` read access rights out of the
 *  path segments. A path built anywhere else, by hand, is one typo away from
 *  either an upload that is rejected or — worse — one that lands somewhere the
 *  policies read as public. So every path in the product comes from the
 *  `paths` object below, and nothing else constructs one.
 *
 *  Buckets are private by default; downloads go through short-lived signed
 *  URLs rather than public links.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const paths = {
  profilePhoto: (userId: string, fileName: string) => `${userId}/${safeName(fileName)}`,

  schoolLogo: (schoolId: string, fileName: string) => `${schoolId}/${safeName(fileName)}`,

  /** A student's own work for an assignment. */
  submission: (schoolId: string, assignmentId: string, studentId: string, fileName: string) =>
    `${schoolId}/${assignmentId}/${studentId}/${safeName(fileName)}`,

  /** The teacher's brief — readable by the whole class. */
  assignmentBrief: (schoolId: string, assignmentId: string, fileName: string) =>
    `${schoolId}/${assignmentId}/brief/${safeName(fileName)}`,

  lessonMaterial: (schoolId: string, classId: string, lessonId: string, fileName: string) =>
    `${schoolId}/${classId}/${lessonId}/${safeName(fileName)}`,

  studentDocument: (schoolId: string, studentId: string, fileName: string) =>
    `${schoolId}/${studentId}/${safeName(fileName)}`,
} as const;

/**
 * Collapse a filename to something safe for an object key, and prefix it with
 * a timestamp so re-uploading "assignment.pdf" does not silently overwrite the
 * previous version.
 */
function safeName(fileName: string): string {
  const cleaned = fileName
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(-120);

  return `${Date.now().toString(36)}-${cleaned || 'file'}`;
}

export interface UploadResult {
  bucket: StorageBucket;
  path: string;
  size: number;
  mimeType: string;
  originalName: string;
}

/**
 * Validate against the client-side mirror of the bucket limits, then upload.
 *
 * The mirror exists to give a useful message before spending the user's
 * bandwidth. Storage enforces the real limit regardless of what happens here.
 */
export async function uploadFile(
  bucket: StorageBucket,
  path: string,
  file: File,
  options: { upsert?: boolean } = {},
): Promise<UploadResult> {
  const limit = UPLOAD_LIMITS[bucket];

  if (file.size > limit.maxBytes) {
    throw new AppError(
      `That file is too large. The limit for this upload is ${Math.round(limit.maxBytes / 1024 / 1024)} MB.`,
      { kind: 'validation' },
    );
  }

  if (file.size === 0) {
    throw new AppError('That file is empty.', { kind: 'validation' });
  }

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: options.upsert ?? false,
    contentType: file.type || 'application/octet-stream',
    cacheControl: '3600',
  });

  if (error) throw toAppError(error);

  return {
    bucket,
    path,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    originalName: file.name,
  };
}

/**
 * Register an uploaded object in `public.files`.
 *
 * Storage holds the bytes; this row makes them queryable ("every attachment on
 * assignment X") and gives the UI a name, size and owner without a HEAD
 * request per file.
 */
export async function registerFile(
  input: Omit<TablesInsert<'files'>, 'owner_id'> & { owner_id?: string },
): Promise<void> {
  const { error } = await supabase.from('files').insert(input);
  if (error) throw toAppError(error);
}

/** Upload and register in one step — the usual path for attachments. */
export async function uploadAndRegister(args: {
  bucket: StorageBucket;
  path: string;
  file: File;
  schoolId: string;
  ownerId: string;
  entityType: string;
  entityId?: string | null;
  visibility?: TablesInsert<'files'>['visibility'];
}): Promise<UploadResult> {
  const uploaded = await uploadFile(args.bucket, args.path, args.file);

  await registerFile({
    bucket: args.bucket,
    path: uploaded.path,
    original_name: uploaded.originalName,
    mime_type: uploaded.mimeType,
    size_bytes: uploaded.size,
    school_id: args.schoolId,
    owner_id: args.ownerId,
    entity_type: args.entityType,
    entity_id: args.entityId ?? null,
    visibility: args.visibility ?? 'private',
  });

  return uploaded;
}

/**
 * A time-limited download link for a private bucket.
 *
 * Never cache the result: the URL is a bearer credential with a five-minute
 * life, and holding one in a long-lived query cache means handing out access
 * after it should have lapsed.
 */
export async function createSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresIn = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw toAppError(error);
  return data.signedUrl;
}

/** Public URL for the two public buckets. Returns null for anything private. */
export function getPublicUrl(
  bucket: StorageBucket,
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  if (bucket !== 'profile-photos' && bucket !== 'school-logos') return null;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteFile(bucket: StorageBucket, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw toAppError(error);

  // Best effort: RLS on `files` may deny the delete for a non-owner, and the
  // object is already gone by then. The nightly cleanup reconciles the rest.
  await supabase.from('files').delete().eq('bucket', bucket).eq('path', path);
}

export async function downloadFile(bucket: StorageBucket, path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw toAppError(error);
  return data;
}
