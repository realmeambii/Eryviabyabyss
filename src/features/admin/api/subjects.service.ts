import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Subject, TablesInsert, TablesUpdate } from '@/shared/types';

/**
 * Subject management.
 *
 * Uniqueness is the database's job: `subjects_code_unique` and
 * `subjects_name_unique` are per-school, so a duplicate comes back as SQLSTATE
 * 23505 and `toAppError()` renders "That record already exists." No pre-flight
 * SELECT — that would be a race, not a check.
 */

export type SubjectWithUsage = Subject & {
  /** How many class-subject pairings reference it. Blocks deletion when > 0. */
  class_count: number;
};

export async function listSubjects(options: { includeInactive?: boolean } = {}) {
  let query = supabase
    .from('subjects')
    .select('*, class_subjects(count)')
    .order('name', { ascending: true });

  if (!options.includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw toAppError(error);

  return (data as unknown as (Subject & { class_subjects: { count: number }[] })[]).map((row) => ({
    ...row,
    class_count: row.class_subjects?.[0]?.count ?? 0,
  })) as SubjectWithUsage[];
}

export async function createSubject(
  input: Omit<TablesInsert<'subjects'>, 'school_id'> & { school_id: string },
): Promise<Subject> {
  const { data, error } = await supabase
    .from('subjects')
    // The CHECK constraint requires 2–6 uppercase letters.
    .insert({ ...input, code: input.code.toUpperCase().trim() })
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export async function updateSubject(id: string, patch: TablesUpdate<'subjects'>): Promise<Subject> {
  const { data, error } = await supabase
    .from('subjects')
    .update(patch.code ? { ...patch, code: patch.code.toUpperCase().trim() } : patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/**
 * Archive rather than delete.
 *
 * `assignments.subject_id` is ON DELETE RESTRICT, so a subject with any history
 * cannot be removed — and should not be: deleting it would orphan every mark
 * ever recorded against it. Setting `is_active = false` hides it from pickers
 * while leaving the record intact.
 */
export async function archiveSubject(id: string): Promise<Subject> {
  return updateSubject(id, { is_active: false });
}

export async function restoreSubject(id: string): Promise<Subject> {
  return updateSubject(id, { is_active: true });
}

/** Only ever succeeds for a subject that was never taught. */
export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from('subjects').delete().eq('id', id);
  if (error) throw toAppError(error);
}
