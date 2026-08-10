import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import {
  createSignedUrl,
  deleteFile as deleteStorageFile,
  paths,
  uploadAndRegister,
} from '@/shared/services/storage.service';
import type {
  Assignment,
  AssignmentSubmission,
  StoredFile,
  TablesInsert,
  TablesUpdate,
} from '@/shared/types';

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
  return data;
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
  return data;
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
 *
 * `gradedByTeacherId` is named the long way round because `graded_by` is a
 * foreign key to **teachers**, not users — and `auth.uid()` is the obvious
 * thing to reach for. Passing a user id here fails at the database with
 * `assignment_submissions_graded_by_fkey`, which is a confusing error to debug
 * from a marking screen.
 */
export async function gradeSubmission(
  id: string,
  input: { score: number; feedback?: string | null; gradedByTeacherId: string },
): Promise<AssignmentSubmission> {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .update({
      score: input.score,
      feedback: input.feedback ?? null,
      graded_by: input.gradedByTeacherId,
      graded_at: new Date().toISOString(),
      status: 'graded',
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/**
 * Hand a marked submission back to the pupil.
 *
 * A separate step from grading on purpose. A teacher marks thirty papers over
 * an evening and wants them to land at once, not to trickle out as each is
 * finished — and a mark entered by mistake is far easier to correct before the
 * class has seen it.
 */
export async function returnSubmission(id: string): Promise<AssignmentSubmission> {
  const { data, error } = await supabase
    .from('assignment_submissions')
    .update({ status: 'returned' })
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export interface BulkGradeEntry {
  submissionId: string;
  score: number;
  feedback?: string | null;
}

export interface BulkGradeResult {
  graded: number;
  failures: { submissionId: string; message: string }[];
}

/**
 * Mark several submissions in one action.
 *
 * Deliberately N round trips rather than one bulk upsert. Every row has to pass
 * through `app.enforce_submission_rules()`, which rejects a score above the
 * assignment maximum — an upsert would take the whole batch down on one bad
 * value, losing twenty-nine good marks a teacher had just typed. This way each
 * failure is reported against its own pupil and the rest still land.
 *
 * `allSettled`, not `all`, for the same reason: the first rejection must not
 * cancel what is already in flight.
 */
export async function bulkGradeSubmissions(
  entries: BulkGradeEntry[],
  gradedByTeacherId: string,
): Promise<BulkGradeResult> {
  const results = await Promise.allSettled(
    entries.map((entry) =>
      gradeSubmission(entry.submissionId, {
        score: entry.score,
        feedback: entry.feedback ?? null,
        gradedByTeacherId,
      }),
    ),
  );

  const failures = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [
          {
            submissionId: entries[index].submissionId,
            message: result.reason instanceof Error ? result.reason.message : 'Failed',
          },
        ]
      : [],
  );

  return { graded: results.length - failures.length, failures };
}

// ── The marking board ───────────────────────────────────────────────────────

export interface SubmissionRow {
  student_id: string;
  full_name: string;
  admission_number: string;
  avatar_path: string | null;
  roll_number: number | null;
  /** Null when they have not handed anything in. */
  submission: AssignmentSubmission | null;
}

/**
 * Every pupil on the roll, with their submission if there is one.
 *
 * Built from the register outward rather than from the submissions inward,
 * because the teacher's first question about an assignment is "who has *not*
 * handed in" — and a list of submissions cannot answer that. It is two queries
 * joined in memory: PostgREST has no outer join across an unrelated pair, and
 * the alternative is a database view for a screen that reads it once.
 */
export async function getSubmissionBoard(args: {
  assignmentId: string;
  classId: string;
  sessionId: string;
}): Promise<SubmissionRow[]> {
  const [roster, submissions] = await Promise.all([
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
      .from('assignment_submissions')
      .select('*')
      .eq('assignment_id', args.assignmentId)
      .order('attempt', { ascending: false }),
  ]);

  if (roster.error) throw toAppError(roster.error);
  if (submissions.error) throw toAppError(submissions.error);

  // Highest attempt wins — the ordering above puts it first, so the first
  // write into the map is the one that stays.
  const latest = new Map<string, AssignmentSubmission>();
  for (const row of submissions.data) {
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
      submission: latest.get(row.student!.id) ?? null,
    }))
    .sort(
      (a, b) =>
        (a.roll_number ?? Number.MAX_SAFE_INTEGER) - (b.roll_number ?? Number.MAX_SAFE_INTEGER) ||
        a.full_name.localeCompare(b.full_name),
    );
}

// ── Analytics ───────────────────────────────────────────────────────────────

export interface AssignmentAnalytics {
  onRoll: number;
  submitted: number;
  graded: number;
  returned: number;
  missing: number;
  late: number;
  submissionRate: number;
  averageScore: number | null;
  averagePercentage: number | null;
  highest: number | null;
  lowest: number | null;
  /** Marks per band of ten percent, index 0 = 0–9%, index 9 = 90–100%. */
  distribution: number[];
}

/**
 * Derived from the board rather than queried separately.
 *
 * The board is already loaded whenever these numbers are shown, and a second
 * set of aggregate queries could disagree with the table right beside it — a
 * teacher seeing "24 handed in" above a list of 23 has no way to tell which is
 * wrong.
 */
export function analyseSubmissions(rows: SubmissionRow[], maxScore: number): AssignmentAnalytics {
  const onRoll = rows.length;
  const handedIn = rows.filter(
    (row) => row.submission !== null && row.submission.status !== 'draft',
  );

  const scores = handedIn
    .map((row) => row.submission?.score)
    .filter((score): score is number => score !== null && score !== undefined);

  const distribution = Array.from({ length: 10 }, () => 0);
  for (const score of scores) {
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
    // 100% belongs in the top band, not an eleventh one.
    const band = Math.min(9, Math.max(0, Math.floor(percentage / 10)));
    distribution[band] = (distribution[band] ?? 0) + 1;
  }

  const total = scores.reduce((sum, score) => sum + score, 0);
  const averageScore = scores.length > 0 ? total / scores.length : null;

  return {
    onRoll,
    submitted: handedIn.length,
    graded: rows.filter((row) => row.submission?.status === 'graded').length,
    returned: rows.filter((row) => row.submission?.status === 'returned').length,
    missing: onRoll - handedIn.length,
    late: handedIn.filter((row) => row.submission?.is_late).length,
    submissionRate: onRoll > 0 ? (handedIn.length / onRoll) * 100 : 0,
    averageScore,
    averagePercentage:
      averageScore !== null && maxScore > 0 ? (averageScore / maxScore) * 100 : null,
    highest: scores.length > 0 ? Math.max(...scores) : null,
    lowest: scores.length > 0 ? Math.min(...scores) : null,
    distribution,
  };
}

// ── Brief attachments ───────────────────────────────────────────────────────
//  The teacher's own material for the assignment, under
//  {school_id}/{assignment_id}/brief/{filename} — the `brief` segment is what
//  the storage policy reads to tell a teacher's handout apart from a pupil's
//  work in the same bucket.

export type AssignmentAttachment = Pick<
  StoredFile,
  'id' | 'bucket' | 'path' | 'original_name' | 'mime_type' | 'size_bytes' | 'created_at'
>;

export async function listAssignmentAttachments(
  assignmentId: string,
): Promise<AssignmentAttachment[]> {
  const { data, error } = await supabase
    .from('files')
    .select('id, bucket, path, original_name, mime_type, size_bytes, created_at')
    .eq('entity_type', 'assignment')
    .eq('entity_id', assignmentId)
    .order('created_at', { ascending: true });

  if (error) throw toAppError(error);
  return data;
}

export async function attachToAssignment(args: {
  assignmentId: string;
  schoolId: string;
  ownerId: string;
  file: File;
}): Promise<void> {
  await uploadAndRegister({
    bucket: 'assignment-uploads',
    path: paths.assignmentBrief(args.schoolId, args.assignmentId, args.file.name),
    file: args.file,
    schoolId: args.schoolId,
    ownerId: args.ownerId,
    entityType: 'assignment',
    entityId: args.assignmentId,
    visibility: 'class',
  });
}

/** Object first, then the row — see the note on lesson attachments. */
export async function removeAssignmentAttachment(file: AssignmentAttachment): Promise<void> {
  await deleteStorageFile(file.bucket, file.path);

  const { error } = await supabase.from('files').delete().eq('id', file.id);
  if (error) throw toAppError(error);
}

/** Files a pupil handed in with their submission. */
export async function listSubmissionAttachments(
  submissionId: string,
): Promise<AssignmentAttachment[]> {
  const { data, error } = await supabase
    .from('files')
    .select('id, bucket, path, original_name, mime_type, size_bytes, created_at')
    .eq('entity_type', 'assignment_submission')
    .eq('entity_id', submissionId)
    .order('created_at', { ascending: true });

  if (error) throw toAppError(error);
  return data;
}

export async function assignmentFileUrl(file: AssignmentAttachment): Promise<string> {
  return createSignedUrl(file.bucket, file.path);
}
