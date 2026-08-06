import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { SchoolClass, TablesInsert, TablesUpdate } from '@/shared/types';

/**
 * Class management.
 *
 * A class belongs to one term: `classes_unique_per_session` keys on
 * (school, session, name, arm), so "JSS 1A" exists once per term and next
 * term's JSS 1A is a different row with its own enrolments. That is what keeps
 * last year's registers intact when this year's are edited.
 */

export type ClassWithCounts = SchoolClass & {
  form_teacher: { id: string; user: { full_name: string } | null } | null;
  student_count: number;
  subject_count: number;
};

const SELECT = `*,
  form_teacher:teachers!classes_form_teacher_id_fkey (
    id, user:users!teachers_user_id_fkey (full_name)
  ),
  enrollments(count),
  class_subjects(count)`;

export async function listClasses(sessionId?: string): Promise<ClassWithCounts[]> {
  let query = supabase
    .from('classes')
    .select(SELECT)
    .order('level', { ascending: true })
    .order('arm', { ascending: true });

  if (sessionId) query = query.eq('academic_session_id', sessionId);

  const { data, error } = await query;
  if (error) throw toAppError(error);

  return (
    data as unknown as (SchoolClass & {
      form_teacher: ClassWithCounts['form_teacher'];
      enrollments: { count: number }[];
      class_subjects: { count: number }[];
    })[]
  ).map((row) => ({
    ...row,
    student_count: row.enrollments?.[0]?.count ?? 0,
    subject_count: row.class_subjects?.[0]?.count ?? 0,
  }));
}

export async function getClass(id: string): Promise<ClassWithCounts> {
  const { data, error } = await supabase.from('classes').select(SELECT).eq('id', id).single();
  if (error) throw toAppError(error);

  const row = data as unknown as SchoolClass & {
    form_teacher: ClassWithCounts['form_teacher'];
    enrollments: { count: number }[];
    class_subjects: { count: number }[];
  };

  return {
    ...row,
    student_count: row.enrollments?.[0]?.count ?? 0,
    subject_count: row.class_subjects?.[0]?.count ?? 0,
  };
}

export async function createClass(input: TablesInsert<'classes'>): Promise<SchoolClass> {
  const { data, error } = await supabase
    .from('classes')
    .insert({ ...input, arm: input.arm?.toUpperCase() ?? 'A' })
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export async function updateClass(
  id: string,
  patch: TablesUpdate<'classes'>,
): Promise<SchoolClass> {
  const { data, error } = await supabase
    .from('classes')
    .update(patch.arm ? { ...patch, arm: patch.arm.toUpperCase() } : patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/**
 * `enrollments.class_id` is ON DELETE RESTRICT, so a class that has ever had a
 * student cannot be deleted — the register would go with it. The UI offers
 * deactivation for those and reserves delete for classes created in error.
 */
export async function deleteClass(id: string): Promise<void> {
  const { error } = await supabase.from('classes').delete().eq('id', id);
  if (error) throw toAppError(error);
}

export async function setFormTeacher(
  classId: string,
  teacherId: string | null,
): Promise<SchoolClass> {
  return updateClass(classId, { form_teacher_id: teacherId });
}

// ── Curriculum ──────────────────────────────────────────────────────────────

/**
 * Replace the subjects a class takes this term.
 *
 * Diffed rather than deleted-and-reinserted: `class_subjects` is referenced by
 * assignments and the timetable, so dropping a row that is still in use would
 * fail on its foreign key — and dropping one that is not would silently discard
 * the periods-per-week already configured for it.
 */
export async function setClassSubjects(args: {
  classId: string;
  schoolId: string;
  sessionId: string;
  subjectIds: string[];
}): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from('class_subjects')
    .select('id, subject_id')
    .eq('class_id', args.classId)
    .eq('academic_session_id', args.sessionId);

  if (readError) throw toAppError(readError);

  const current = new Set((existing ?? []).map((row) => row.subject_id));
  const wanted = new Set(args.subjectIds);

  const toAdd = args.subjectIds.filter((id) => !current.has(id));
  const toRemove = (existing ?? []).filter((row) => !wanted.has(row.subject_id));

  if (toAdd.length > 0) {
    const { error } = await supabase.from('class_subjects').insert(
      toAdd.map((subjectId) => ({
        class_id: args.classId,
        subject_id: subjectId,
        school_id: args.schoolId,
        academic_session_id: args.sessionId,
      })),
    );
    if (error) throw toAppError(error);
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('class_subjects')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id),
      );
    if (error) throw toAppError(error);
  }
}

// ── Who teaches what ────────────────────────────────────────────────────────
//  `teacher_assignments` is the row that makes a teacher's portal work at all.
//  Without one they sign in to an empty dashboard: `app.teaches_class()` and
//  `app.teaches_class_subject()` sit in the USING clause of every teacher
//  policy, so an unassigned teacher can see nothing and author nothing.

export interface ClassTeaching {
  id: string;
  class_id: string;
  subject_id: string;
  is_lead: boolean;
  teacher: {
    id: string;
    staff_number: string;
    user: { full_name: string } | null;
  } | null;
  subject: { id: string; name: string; code: string; color: string } | null;
}

export async function listClassTeaching(
  classId: string,
  sessionId: string,
): Promise<ClassTeaching[]> {
  const { data, error } = await supabase
    .from('teacher_assignments')
    .select(
      `id, class_id, subject_id, is_lead,
       teacher:teachers!teacher_assignments_teacher_id_fkey (
         id, staff_number, user:users!teachers_user_id_fkey (full_name)
       ),
       subject:subjects!teacher_assignments_subject_id_fkey (id, name, code, color)`,
    )
    .eq('class_id', classId)
    .eq('academic_session_id', sessionId);

  if (error) throw toAppError(error);
  return data as unknown as ClassTeaching[];
}

/**
 * Put a teacher against a class and subject.
 *
 * `is_lead` defaults to true because the common case is one teacher owning the
 * pairing. `teacher_assignments_one_lead` is a partial unique index over
 * (class, subject, term) where `is_lead`, so a second lead for the same pairing
 * comes back as 23505 — "That record already exists" — rather than silently
 * creating two people who both own the final grade.
 */
export async function assignTeacher(input: {
  schoolId: string;
  teacherId: string;
  classId: string;
  subjectId: string;
  sessionId: string;
  isLead?: boolean;
}): Promise<void> {
  const { error } = await supabase.from('teacher_assignments').insert({
    school_id: input.schoolId,
    teacher_id: input.teacherId,
    class_id: input.classId,
    subject_id: input.subjectId,
    academic_session_id: input.sessionId,
    is_lead: input.isLead ?? true,
  });

  if (error) throw toAppError(error);
}

/**
 * Remove an assignment.
 *
 * Deliberately not cascading to their work. A teacher who stops taking a class
 * keeps authorship of the lessons and assignments they wrote — `lessons.created_by`
 * is ON DELETE SET NULL against `teachers`, not against this table — and the
 * marks they recorded stay in the gradebook. What they lose is access, which is
 * what an unassignment means.
 */
export async function unassignTeacher(assignmentId: string): Promise<void> {
  const { error } = await supabase.from('teacher_assignments').delete().eq('id', assignmentId);
  if (error) throw toAppError(error);
}

export interface TeacherOption {
  id: string;
  staff_number: string;
  full_name: string;
}

/** Staff who can be put against a class. Active teachers only. */
export async function listAssignableTeachers(): Promise<TeacherOption[]> {
  const { data, error } = await supabase
    .from('teachers')
    .select('id, staff_number, user:users!teachers_user_id_fkey (full_name)')
    .eq('is_active', true);

  if (error) throw toAppError(error);

  const rows = data as unknown as {
    id: string;
    staff_number: string;
    user: { full_name: string } | null;
  }[];

  return rows
    .map((row) => ({
      id: row.id,
      staff_number: row.staff_number,
      full_name: row.user?.full_name ?? 'Unnamed teacher',
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}
