import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type {
  QuestionBankItem,
  Quiz,
  QuizAttempt,
  QuizPaperQuestion,
  QuizQuestion,
  QuizResponses,
  TablesInsert,
  TablesUpdate,
} from '@/shared/types';

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

// ═══ Teacher side ═══════════════════════════════════════════════════════════
//  Authoring, review and release. Every read below is confined by
//  `quiz_questions_select_staff` and `quiz_attempts_select_authorised`, which
//  resolve through `app.teaches_class_subject()` — a teacher sees the answer
//  key for their own papers and for nobody else's.

export async function createQuiz(input: TablesInsert<'quizzes'>): Promise<Quiz> {
  const { data, error } = await supabase.from('quizzes').insert(input).select().single();
  if (error) throw toAppError(error);
  return data;
}

export async function updateQuiz(id: string, patch: TablesUpdate<'quizzes'>): Promise<Quiz> {
  const { data, error } = await supabase
    .from('quizzes')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export async function publishQuiz(id: string): Promise<Quiz> {
  return updateQuiz(id, { status: 'published', published_at: new Date().toISOString() });
}

export async function deleteQuiz(id: string): Promise<void> {
  const { error } = await supabase.from('quizzes').delete().eq('id', id);
  if (error) throw toAppError(error);
}

// ── Questions ───────────────────────────────────────────────────────────────
//  `quizzes.total_points` is a cache of sum(points), maintained by
//  `app.recalc_quiz_total_points()`. Nothing here writes it.

/** The full question, answer key included. Teachers and administrators only. */
export async function listQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
  const { data, error } = await supabase
    .from('quiz_questions')
    .select('*')
    .eq('quiz_id', quizId)
    .order('sort_order', { ascending: true });

  if (error) throw toAppError(error);
  return data;
}

export async function createQuestion(input: TablesInsert<'quiz_questions'>): Promise<QuizQuestion> {
  const { data, error } = await supabase.from('quiz_questions').insert(input).select().single();
  if (error) throw toAppError(error);
  return data;
}

export async function updateQuestion(
  id: string,
  patch: TablesUpdate<'quiz_questions'>,
): Promise<QuizQuestion> {
  const { data, error } = await supabase
    .from('quiz_questions')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('quiz_questions').delete().eq('id', id);
  if (error) throw toAppError(error);
}

/**
 * Move a question up or down the paper.
 *
 * `quiz_questions_order_unique` is a plain UNIQUE checked per row, not
 * deferred, so a straight swap collides the moment the first row takes the
 * other's number. The displaced question is parked above the paper first —
 * `sort_order` has to be unique, not contiguous.
 */
export async function swapQuestionOrder(
  a: { id: string; sort_order: number },
  b: { id: string; sort_order: number },
): Promise<void> {
  const parking = 30000 + Math.floor(Math.random() * 1000);

  const park = await supabase.from('quiz_questions').update({ sort_order: parking }).eq('id', a.id);
  if (park.error) throw toAppError(park.error);

  const moveB = await supabase
    .from('quiz_questions')
    .update({ sort_order: a.sort_order })
    .eq('id', b.id);
  if (moveB.error) throw toAppError(moveB.error);

  const moveA = await supabase
    .from('quiz_questions')
    .update({ sort_order: b.sort_order })
    .eq('id', a.id);
  if (moveA.error) throw toAppError(moveA.error);
}

/**
 * Copy a quiz, questions and all.
 *
 * Always lands as a draft with its window cleared. A duplicate is next term's
 * paper or a variant for another class — never a second live copy of the one
 * being sat, which is what carrying `status` across would create.
 */
export async function duplicateQuiz(
  quizId: string,
  overrides: { classId?: string; subjectId?: string; sessionId?: string; title?: string } = {},
): Promise<Quiz> {
  const source = await getQuiz(quizId);
  const questions = await listQuizQuestions(quizId);

  const copy = await createQuiz({
    school_id: source.school_id,
    class_id: overrides.classId ?? source.class_id,
    subject_id: overrides.subjectId ?? source.subject_id,
    academic_session_id: overrides.sessionId ?? source.academic_session_id,
    created_by: source.created_by,
    title: overrides.title ?? `${source.title} (copy)`,
    description: source.description,
    instructions: source.instructions,
    assessment_type: source.assessment_type,
    duration_minutes: source.duration_minutes,
    passing_percentage: source.passing_percentage,
    weight: source.weight,
    max_attempts: source.max_attempts,
    shuffle_questions: source.shuffle_questions,
    shuffle_options: source.shuffle_options,
    show_results_immediately: source.show_results_immediately,
    status: 'draft',
    opens_at: null,
    closes_at: null,
  });

  if (questions.length > 0) {
    const { error } = await supabase.from('quiz_questions').insert(
      questions.map((question) => ({
        school_id: question.school_id,
        quiz_id: copy.id,
        sort_order: question.sort_order,
        question_type: question.question_type,
        prompt: question.prompt,
        options: question.options,
        correct_answers: question.correct_answers,
        points: question.points,
        explanation: question.explanation,
        media_path: question.media_path,
      })),
    );
    if (error) throw toAppError(error);
  }

  return copy;
}

// ── Attempts ────────────────────────────────────────────────────────────────

export interface AttemptRow {
  student_id: string;
  full_name: string;
  admission_number: string;
  avatar_path: string | null;
  roll_number: number | null;
  attempt: QuizAttempt | null;
}

/**
 * Every pupil on the roll with their latest attempt.
 *
 * The same shape, and for the same reason, as the assignment marking board:
 * "who has not sat it" is a question a list of attempts cannot answer.
 */
export async function getAttemptBoard(args: {
  quizId: string;
  classId: string;
  sessionId: string;
}): Promise<AttemptRow[]> {
  const [roster, attempts] = await Promise.all([
    supabase
      .from('enrollments')
      .select(
        `roll_number,
         student:students!enrollments_student_id_fkey (
           id, admission_number,
           user:users!students_user_id_fkey (full_name, avatar_path)
         )`,
      )
      .eq('class_id', args.classId)
      .eq('academic_session_id', args.sessionId)
      .eq('status', 'active'),

    supabase
      .from('quiz_attempts')
      .select('*')
      .eq('quiz_id', args.quizId)
      .order('attempt_number', { ascending: false }),
  ]);

  if (roster.error) throw toAppError(roster.error);
  if (attempts.error) throw toAppError(attempts.error);

  const latest = new Map<string, QuizAttempt>();
  for (const row of attempts.data) {
    if (!latest.has(row.student_id)) latest.set(row.student_id, row);
  }

  const rows = roster.data as unknown as {
    roll_number: number | null;
    student: {
      id: string;
      admission_number: string;
      user: { full_name: string; avatar_path: string | null } | null;
    } | null;
  }[];

  return rows
    .filter((row) => row.student !== null)
    .map((row) => ({
      student_id: row.student!.id,
      full_name: row.student!.user?.full_name ?? 'Unnamed student',
      admission_number: row.student!.admission_number,
      avatar_path: row.student!.user?.avatar_path ?? null,
      roll_number: row.roll_number,
      attempt: latest.get(row.student!.id) ?? null,
    }))
    .sort(
      (a, b) =>
        (a.roll_number ?? Number.MAX_SAFE_INTEGER) - (b.roll_number ?? Number.MAX_SAFE_INTEGER) ||
        a.full_name.localeCompare(b.full_name),
    );
}

/**
 * Record a mark for a paper the auto-marker left to a human.
 *
 * `status = 'graded'` with a `graded_at` is what makes
 * `app.sync_grade_from_quiz_attempt()` write the gradebook row, so this is one
 * write and not two — the same arrangement as assignment marking.
 */
export async function gradeAttempt(id: string, input: { score: number }): Promise<QuizAttempt> {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .update({ score: input.score, status: 'graded', graded_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/**
 * Release results to the class.
 *
 * `show_results_immediately` decides whether a pupil sees their mark the moment
 * they submit. With it off, marks sit until a teacher has looked the papers
 * over; flipping it for everyone at once is the release.
 */
export async function releaseQuizResults(quizId: string): Promise<Quiz> {
  return updateQuiz(quizId, { show_results_immediately: true });
}

// ── Question bank ───────────────────────────────────────────────────────────

export interface QuestionBankFilters {
  subjectId?: string;
  search?: string;
  questionType?: QuizQuestion['question_type'];
  limit?: number;
}

export async function listBankQuestions(
  filters: QuestionBankFilters = {},
): Promise<QuestionBankItem[]> {
  let query = supabase
    .from('question_bank_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.questionType) query = query.eq('question_type', filters.questionType);
  // `ilike` rides the trigram index created with the table.
  if (filters.search?.trim()) query = query.ilike('prompt', `%${filters.search.trim()}%`);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data;
}

export async function saveToBank(
  input: TablesInsert<'question_bank_items'>,
): Promise<QuestionBankItem> {
  const { data, error } = await supabase
    .from('question_bank_items')
    .insert(input)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export async function deleteBankQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('question_bank_items').delete().eq('id', id);
  if (error) throw toAppError(error);
}

/**
 * Copy bank items onto a paper.
 *
 * Copied, never referenced. A bank item edited next year must not silently
 * rewrite a paper pupils have already sat — the mark would then stand against
 * a question that no longer exists as it was answered.
 */
export async function addBankQuestionsToQuiz(args: {
  quizId: string;
  schoolId: string;
  items: QuestionBankItem[];
  startAt: number;
}): Promise<void> {
  if (args.items.length === 0) return;

  const { error } = await supabase.from('quiz_questions').insert(
    args.items.map((item, index) => ({
      school_id: args.schoolId,
      quiz_id: args.quizId,
      sort_order: args.startAt + index,
      question_type: item.question_type,
      prompt: item.prompt,
      options: item.options,
      correct_answers: item.correct_answers,
      points: item.points,
      explanation: item.explanation,
    })),
  );

  if (error) throw toAppError(error);
}
