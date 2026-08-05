import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Quiz, QuizAttempt, QuizPaperQuestion, QuizResponses } from '@/shared/types';

/**
 * Quizzes data access.
 *
 * The read/write split here is the important part.
 *
 *  • Listing quizzes is a plain table read under RLS.
 *  • Fetching the *paper* is not. `quiz_questions.correct_answers` sits in the
 *    same row as the options, and RLS cannot hide one column from a reader of
 *    the other — so students have no SELECT policy on that table at all, and
 *    `get_quiz_paper()` returns the questions with the answer key stripped.
 *  • Starting and submitting an attempt go through RPCs for the same reason:
 *    a client that could INSERT into `quiz_attempts` could set its own score.
 */

export interface QuizFilters {
  classId?: string;
  subjectId?: string;
  sessionId?: string;
  status?: Quiz['status'];
  limit?: number;
}

export async function listQuizzes(filters: QuizFilters = {}): Promise<Quiz[]> {
  let query = supabase
    .from('quizzes')
    .select('*')
    .order('opens_at', { ascending: false, nullsFirst: false });

  if (filters.classId) query = query.eq('class_id', filters.classId);
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.sessionId) query = query.eq('academic_session_id', filters.sessionId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data;
}

export async function getQuiz(id: string): Promise<Quiz> {
  const { data, error } = await supabase.from('quizzes').select('*').eq('id', id).single();
  if (error) throw toAppError(error);
  return data;
}

/** The student's view of the paper — no `correct_answers`, no `explanation`. */
export async function getQuizPaper(quizId: string): Promise<QuizPaperQuestion[]> {
  const { data, error } = await supabase.rpc('get_quiz_paper', { p_quiz_id: quizId });
  if (error) throw toAppError(error);
  return data as unknown as QuizPaperQuestion[];
}

/**
 * Open (or resume) an attempt.
 *
 * The RPC enforces the attempt limit and stamps `expires_at` from the server
 * clock, so the countdown in the UI is a display of the deadline rather than
 * the deadline itself.
 */
export async function startAttempt(quizId: string): Promise<QuizAttempt> {
  const { data, error } = await supabase.rpc('start_quiz_attempt', { p_quiz_id: quizId });
  if (error) throw toAppError(error);
  return data;
}

/**
 * Hand in the paper. Objective questions are marked inside the RPC; anything
 * needing a human leaves the attempt `submitted` until a teacher marks it.
 */
export async function submitAttempt(
  attemptId: string,
  responses: QuizResponses,
): Promise<QuizAttempt> {
  const { data, error } = await supabase.rpc('submit_quiz_attempt', {
    p_attempt_id: attemptId,
    p_responses: responses,
  });
  if (error) throw toAppError(error);
  return data;
}

export async function listMyAttempts(quizId: string, studentId: string): Promise<QuizAttempt[]> {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('quiz_id', quizId)
    .eq('student_id', studentId)
    .order('attempt_number', { ascending: false });

  if (error) throw toAppError(error);
  return data;
}
