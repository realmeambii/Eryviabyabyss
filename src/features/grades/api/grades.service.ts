import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Grade, TablesInsert, TablesUpdate } from '@/shared/types';

/**
 * Gradebook data access.
 *
 * `grades` is the published record. Assignment and quiz marks arrive here
 * through triggers (`app.sync_grade_from_submission`,
 * `app.sync_grade_from_quiz_attempt`) rather than a second client write, so a
 * mark and its gradebook entry cannot disagree.
 *
 * `percentage` and `letter_grade` are computed in the database — the letter is
 * frozen against the school's scale at the moment it is recorded, so re-tuning
 * the scale next year does not silently rewrite last year's reports.
 */

export type GradeWithSubject = Grade & {
  subject: { id: string; name: string; code: string; color: string } | null;
};

export interface StudentGradeFilters {
  sessionId?: string;
  subjectId?: string;
  publishedOnly?: boolean;
}

export async function listStudentGrades(
  studentId: string,
  filters: StudentGradeFilters = {},
): Promise<GradeWithSubject[]> {
  let query = supabase
    .from('grades')
    .select(`*, subject:subjects!grades_subject_id_fkey (id, name, code, color)`)
    .eq('student_id', studentId)
    .order('recorded_at', { ascending: false });

  if (filters.sessionId) query = query.eq('academic_session_id', filters.sessionId);
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.publishedOnly !== false) query = query.eq('is_published', true);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data as unknown as GradeWithSubject[];
}

export async function listClassGrades(
  classId: string,
  options: { subjectId?: string; sessionId?: string } = {},
): Promise<Grade[]> {
  let query = supabase.from('grades').select('*').eq('class_id', classId);

  if (options.subjectId) query = query.eq('subject_id', options.subjectId);
  if (options.sessionId) query = query.eq('academic_session_id', options.sessionId);

  const { data, error } = await query.order('recorded_at', { ascending: false });
  if (error) throw toAppError(error);
  return data;
}

/** A manual entry — an oral test, a practical — with no assignment behind it. */
export async function recordGrade(input: TablesInsert<'grades'>): Promise<Grade> {
  const { data, error } = await supabase
    .from('grades')
    .insert({ ...input, source_type: input.source_type ?? 'manual' })
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export async function updateGrade(id: string, patch: TablesUpdate<'grades'>): Promise<Grade> {
  const { data, error } = await supabase
    .from('grades')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/**
 * Weighted subject average for a term.
 *
 * Computed client-side from rows RLS has already filtered — a student sees
 * their own average, a teacher the average of a student they teach. Phase 2
 * moves this into a database view once report cards need the same figure
 * server-side.
 */
export function subjectAverage(grades: Grade[]): number | null {
  if (grades.length === 0) return null;

  const totalWeight = grades.reduce((sum, grade) => sum + Number(grade.weight), 0);
  if (totalWeight === 0) return null;

  const weighted = grades.reduce(
    (sum, grade) => sum + Number(grade.percentage) * Number(grade.weight),
    0,
  );

  return Math.round((weighted / totalWeight) * 100) / 100;
}
