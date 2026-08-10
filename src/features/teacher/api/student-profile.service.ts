import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Student, StudentNote, TablesInsert, UserProfile } from '@/shared/types';

/**
 * A pupil, as their teacher sees them.
 *
 * What is *not* here is the point of the file. `students` carries medical
 * notes, an address, an emergency contact and a guardian's phone number, and
 * `app.protect_student_columns()` stops a teacher editing the administrative
 * fields — but RLS is row-level, so a `select *` would still put a child's
 * medical history on a subject teacher's screen.
 *
 * So every read below names its columns. A teacher gets what they need to teach
 * the pupil: who they are, what they have handed in, how they are doing. The
 * pastoral record stays with the office.
 */

export interface StudentProfile {
  student_id: string;
  user_id: string;
  full_name: string;
  admission_number: string;
  avatar_path: string | null;
  email: string;
  status: Student['status'];
  admission_date: string;
  current_class: { id: string; name: string; arm: string } | null;
  date_of_birth: string | null;
  gender: UserProfile['gender'];
}

export async function getStudentProfile(studentId: string): Promise<StudentProfile> {
  const { data, error } = await supabase
    .from('students')
    .select(
      `id, admission_number, admission_date, status,
       user:users!students_user_id_fkey (id, full_name, email, avatar_path, date_of_birth, gender),
       current_class:classes!students_current_class_id_fkey (id, name, arm)`,
    )
    .eq('id', studentId)
    .single();

  if (error) throw toAppError(error);

  const row = data as unknown as {
    id: string;
    admission_number: string;
    admission_date: string;
    status: Student['status'];
    user: {
      id: string;
      full_name: string;
      email: string;
      avatar_path: string | null;
      date_of_birth: string | null;
      gender: UserProfile['gender'];
    } | null;
    current_class: { id: string; name: string; arm: string } | null;
  };

  return {
    student_id: row.id,
    user_id: row.user?.id ?? '',
    full_name: row.user?.full_name ?? 'Unnamed student',
    admission_number: row.admission_number,
    avatar_path: row.user?.avatar_path ?? null,
    email: row.user?.email ?? '',
    status: row.status,
    admission_date: row.admission_date,
    current_class: row.current_class,
    date_of_birth: row.user?.date_of_birth ?? null,
    gender: row.user?.gender ?? null,
  };
}

// ── Work history ────────────────────────────────────────────────────────────

export interface SubmissionHistoryRow {
  id: string;
  status: string;
  score: number | null;
  is_late: boolean;
  submitted_at: string | null;
  feedback: string | null;
  assignment: {
    id: string;
    title: string;
    max_score: number;
    due_at: string;
    subject_id: string;
  } | null;
}

export async function getStudentSubmissions(
  studentId: string,
  sessionId?: string,
): Promise<SubmissionHistoryRow[]> {
  let query = supabase
    .from('assignment_submissions')
    .select(
      `id, status, score, is_late, submitted_at, feedback,
       assignment:assignments!inner (id, title, max_score, due_at, subject_id, academic_session_id)`,
    )
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(100);

  if (sessionId) query = query.eq('assignment.academic_session_id', sessionId);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data;
}

export interface AttemptHistoryRow {
  id: string;
  status: string;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  submitted_at: string | null;
  quiz: { id: string; title: string; subject_id: string; passing_percentage: number } | null;
}

export async function getStudentAttempts(
  studentId: string,
  sessionId?: string,
): Promise<AttemptHistoryRow[]> {
  let query = supabase
    .from('quiz_attempts')
    .select(
      `id, status, score, max_score, percentage, submitted_at,
       quiz:quizzes!inner (id, title, subject_id, passing_percentage, academic_session_id)`,
    )
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(100);

  if (sessionId) query = query.eq('quiz.academic_session_id', sessionId);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data;
}

// ── Teacher notes ───────────────────────────────────────────────────────────

export type NoteWithAuthor = StudentNote & {
  teacher: { id: string; user: { full_name: string } | null } | null;
  subject: { id: string; name: string; code: string } | null;
};

/**
 * Notes about this pupil that the caller may read.
 *
 * `student_notes_select_staff` does the deciding: the author always, colleagues
 * who teach the pupil unless the note is private, administrators regardless.
 * Nothing here filters — a second copy of that rule would be the one that goes
 * stale, and getting it wrong means showing a private observation to the wrong
 * member of staff.
 */
export async function listStudentNotes(studentId: string): Promise<NoteWithAuthor[]> {
  const { data, error } = await supabase
    .from('student_notes')
    .select(
      `*,
       teacher:teachers!student_notes_teacher_id_fkey (
         id, user:users!teachers_user_id_fkey (full_name)
       ),
       subject:subjects!student_notes_subject_id_fkey (id, name, code)`,
    )
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw toAppError(error);
  return data;
}

export async function addStudentNote(input: TablesInsert<'student_notes'>): Promise<StudentNote> {
  const { data, error } = await supabase.from('student_notes').insert(input).select().single();
  if (error) throw toAppError(error);
  return data;
}

export async function updateStudentNote(
  id: string,
  patch: { body?: string; is_private?: boolean },
): Promise<StudentNote> {
  const { data, error } = await supabase
    .from('student_notes')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export async function deleteStudentNote(id: string): Promise<void> {
  const { error } = await supabase.from('student_notes').delete().eq('id', id);
  if (error) throw toAppError(error);
}

// ── Progress ────────────────────────────────────────────────────────────────

export interface StudentProgress {
  submitted: number;
  missing: number;
  late: number;
  averagePercentage: number | null;
  quizzesSat: number;
  quizzesPassed: number;
  /** Published grade percentages, oldest first — the shape of a trend line. */
  trend: { at: string; percentage: number }[];
}

/**
 * Derived in memory from data the profile has already loaded.
 *
 * A second round of aggregate queries could disagree with the tables beside it,
 * and "12 submitted" above a list of 11 gives a teacher no way to tell which is
 * wrong.
 */
export function summariseProgress(
  submissions: SubmissionHistoryRow[],
  attempts: AttemptHistoryRow[],
  grades: { percentage: number | null; recorded_at: string; is_published: boolean }[],
): StudentProgress {
  const handedIn = submissions.filter((row) => row.status !== 'draft');

  const marked = handedIn
    .filter((row) => row.score !== null && row.assignment)
    .map((row) => (row.score! / row.assignment!.max_score) * 100);

  const sat = attempts.filter((row) => row.status !== 'in_progress');

  const trend = grades
    .filter((row) => row.is_published && row.percentage !== null)
    .map((row) => ({ at: row.recorded_at, percentage: row.percentage! }))
    .sort((a, b) => a.at.localeCompare(b.at));

  return {
    submitted: handedIn.length,
    missing: submissions.filter((row) => row.status === 'missing').length,
    late: handedIn.filter((row) => row.is_late).length,
    averagePercentage:
      marked.length > 0 ? marked.reduce((sum, value) => sum + value, 0) / marked.length : null,
    quizzesSat: sat.length,
    quizzesPassed: sat.filter(
      (row) => row.percentage !== null && row.quiz && row.percentage >= row.quiz.passing_percentage,
    ).length,
    trend,
  };
}
