import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Assignment, AssignmentSubmission, TablesInsert, TablesUpdate } from '@/shared/types';

/**
 * Assignments data access.
 *
 * Every function here is a thin, typed wrapper over PostgREST. There are no
 * permission checks in this file, and that is deliberate: `assignments_*` and
 * `submissions_*` in `20260801001000_rls_policies.sql` already decide what a
 * student, a teacher and an administrator can each see and write. Re-checking
 * in TypeScript would be a second copy of the rules, free to drift.
 */

export interface AssignmentFilters {
  classId?: string;
  subjectId?: string;
  sessionId?: string;
  status?: Assignment['status'];
  dueAfter?: string;
  dueBefore?: string;
  limit?: number;
}

/** Assignment plus the joined names the list view renders. */
export type AssignmentWithContext = Assignment & {
  subject: { id: string; name: string; code: string; color: string } | null;
  class: { id: string; name: string; arm: string } | null;
};

export async function listAssignments(
  filters: AssignmentFilters = {},
): Promise<AssignmentWithContext[]> {
  let query = supabase
    .from('assignments')
    .select(
      `*,
       subject:subjects!assignments_subject_id_fkey (id, name, code, color),
       class:classes!assignments_class_id_fkey (id, name, arm)`,
    )
    .order('due_at', { ascending: true })
    .limit(filters.limit ?? 100);

  if (filters.classId) query = query.eq('class_id', filters.classId);
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.sessionId) query = query.eq('academic_session_id', filters.sessionId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.dueAfter) query = query.gte('due_at', filters.dueAfter);
  if (filters.dueBefore) query = query.lte('due_at', filters.dueBefore);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data as unknown as AssignmentWithContext[];
}

export async function getAssignment(id: string): Promise<AssignmentWithContext> {
  const { data, error } = await supabase
    .from('assignments')
    .select(
      `*,
       subject:subjects!assignments_subject_id_fkey (id, name, code, color),
       class:classes!assignments_class_id_fkey (id, name, arm)`,
    )
    .eq('id', id)
    .single();

  if (error) throw toAppError(error);
  return data as unknown as AssignmentWithContext;
}

export async function createAssignment(input: TablesInsert<'assignments'>): Promise<Assignment> {
  const { data, error } = await supabase.from('assignments').insert(input).select().single();
  if (error) throw toAppError(error);
  return data;
}

export async function updateAssignment(
  id: string,
  patch: TablesUpdate<'assignments'>,
): Promise<Assignment> {
  const { data, error } = await supabase
    .from('assignments')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/**
 * Publishing is the moment the class is notified — the trigger
 * `notify_class_on_assignment_publish` fans out from this single update.
 */
export async function publishAssignment(id: string): Promise<Assignment> {
  return updateAssignment(id, { status: 'published', published_at: new Date().toISOString() });
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await supabase.from('assignments').delete().eq('id', id);
  if (error) throw toAppError(error);
}

// ── Submissions ─────────────────────────────────────────────────────────────

export async function listSubmissions(assignmentId: string): Promise<AssignmentSubmission[]> {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: true });

  if (error) throw toAppError(error);
  return data;
}

/** The caller's own submission. RLS narrows it to them; `maybeSingle` allows none. */
export async function getMySubmission(
  assignmentId: string,
  studentId: string,
): Promise<AssignmentSubmission | null> {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .order('attempt', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw toAppError(error);
  return data;
}

/**
 * Hand in work.
 *
 * `submitted_at` and `is_late` are set by `app.enforce_submission_rules()` from
 * the database clock — a client that sent its own timestamp would be able to
 * un-late a submission by adjusting the machine's date.
 */
export async function submitAssignment(
  input: Omit<TablesInsert<'assignment_submissions'>, 'is_late' | 'score'>,
): Promise<AssignmentSubmission> {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .upsert(
      { ...input, status: input.status ?? 'submitted' },
      {
        onConflict: 'assignment_id,student_id,attempt',
      },
    )
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/**
 * Record a mark. The gradebook row is written by
 * `app.sync_grade_from_submission()`, so grading is one write, not two.
 */
export async function gradeSubmission(
  id: string,
  input: { score: number; feedback?: string | null; gradedBy: string },
): Promise<AssignmentSubmission> {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .update({
      score: input.score,
      feedback: input.feedback ?? null,
      graded_by: input.gradedBy,
      graded_at: new Date().toISOString(),
      status: 'graded',
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}
