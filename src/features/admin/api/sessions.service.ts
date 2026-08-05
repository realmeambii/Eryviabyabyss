import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { AcademicSession, TablesInsert, TablesUpdate } from '@/shared/types';

/**
 * Academic sessions — one row per term within a session year.
 *
 * "Only one active session" is enforced by the partial unique index
 * `academic_sessions_one_current_per_school`, not by this code. `activate()`
 * therefore clears the current flag first and sets the new one second; doing it
 * in the other order would collide with the index.
 *
 * That ordering is the whole reason this is a function rather than a plain
 * update from the form.
 */

export async function listSessions(): Promise<AcademicSession[]> {
  const { data, error } = await supabase
    .from('academic_sessions')
    .select('*')
    .order('starts_on', { ascending: false });

  if (error) throw toAppError(error);
  return data;
}

export async function getCurrentSession(): Promise<AcademicSession | null> {
  const { data, error } = await supabase
    .from('academic_sessions')
    .select('*')
    .eq('is_current', true)
    .maybeSingle();

  if (error) throw toAppError(error);
  return data;
}

export async function createSession(
  input: TablesInsert<'academic_sessions'>,
): Promise<AcademicSession> {
  const { data, error } = await supabase
    .from('academic_sessions')
    // Never create as current — activation is a separate, deliberate step.
    .insert({ ...input, is_current: false })
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export async function updateSession(
  id: string,
  patch: TablesUpdate<'academic_sessions'>,
): Promise<AcademicSession> {
  const { data, error } = await supabase
    .from('academic_sessions')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/**
 * Make one term current.
 *
 * Two statements, deliberately in this order. The unique index permits at most
 * one `is_current` row per school, so the outgoing term must be cleared before
 * the incoming one is set — the reverse fails on the index.
 *
 * Not atomic across the two writes. If the second fails the school is left with
 * no current term, which is visible and recoverable; the alternative failure —
 * two current terms — is not representable, because the index forbids it.
 */
export async function activateSession(id: string, schoolId: string): Promise<AcademicSession> {
  const { error: clearError } = await supabase
    .from('academic_sessions')
    .update({ is_current: false })
    .eq('school_id', schoolId)
    .eq('is_current', true);

  if (clearError) throw toAppError(clearError);

  return updateSession(id, { is_current: true });
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('academic_sessions').delete().eq('id', id);
  if (error) throw toAppError(error);
}
