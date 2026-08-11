import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';

/**
 * What has been set across the school.
 *
 * Read only. An administrator can already see every assignment and quiz —
 * `assignments_select_authorised` ends in `or app.is_admin()` — so this adds no
 * access; it answers the question the office asks in week three, which is which
 * classes have had nothing set.
 *
 * Response counts come from a second query and are folded in, rather than from
 * a PostgREST aggregate. `count` on an embedded resource returns the count the
 * *policy* allows, which for an administrator is the whole table and therefore
 * right — but it is right by accident, and a later policy change would silently
 * make these numbers wrong rather than empty. Counting rows we fetched is
 * checkable.
 */

export interface CourseworkRow {
  id: string;
  title: string;
  status: string;
  className: string;
  subjectName: string;
  teacherName: string | null;
  dueAt: string | null;
  responses: number;
}

export async function listCoursework(args: {
  kind: 'assignments' | 'quizzes';
  sessionId: string;
  classId?: string;
  subjectId?: string;
}): Promise<CourseworkRow[]> {
  const isAssignments = args.kind === 'assignments';

  const select = isAssignments
    ? `id, title, status, due_at,
       class:classes!assignments_class_id_fkey (name, arm),
       subject:subjects!assignments_subject_id_fkey (name),
       teacher:teachers!assignments_created_by_fkey (
         user:users!teachers_user_id_fkey (full_name)
       )`
    : `id, title, status,
       class:classes!quizzes_class_id_fkey (name, arm),
       subject:subjects!quizzes_subject_id_fkey (name),
       teacher:teachers!quizzes_created_by_fkey (
         user:users!teachers_user_id_fkey (full_name)
       )`;

  let query = supabase
    .from(args.kind)
    .select(select)
    .eq('academic_session_id', args.sessionId)
    .order('created_at', { ascending: false })
    .limit(300);

  if (args.classId) query = query.eq('class_id', args.classId);
  if (args.subjectId) query = query.eq('subject_id', args.subjectId);

  const { data, error } = await query;
  if (error) throw toAppError(error);

  const rows = data as unknown as {
    id: string;
    title: string;
    status: string;
    due_at?: string | null;
    class: { name: string; arm: string } | null;
    subject: { name: string } | null;
    teacher: { user: { full_name: string } | null } | null;
  }[];

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const { data: responses, error: responseError } = isAssignments
    ? await supabase
        .from('assignment_submissions')
        .select('assignment_id')
        .in('assignment_id', ids)
        .neq('status', 'draft')
    : await supabase.from('quiz_attempts').select('quiz_id').in('quiz_id', ids);

  if (responseError) throw toAppError(responseError);

  const counts = new Map<string, number>();
  for (const row of responses as unknown as Record<string, string>[]) {
    const key = isAssignments ? row.assignment_id : row.quiz_id;
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    className: row.class ? `${row.class.name}${row.class.arm}` : 'Class',
    subjectName: row.subject?.name ?? 'Subject',
    teacherName: row.teacher?.user?.full_name ?? null,
    dueAt: row.due_at ?? null,
    responses: counts.get(row.id) ?? 0,
  }));
}
