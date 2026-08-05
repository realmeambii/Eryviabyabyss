import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Enrollment, SchoolClass, Subject, Teacher, UserProfile } from '@/shared/types';

/**
 * Student data access — the "what am I enrolled in" queries every student
 * screen starts from.
 *
 * No permission checks here. `enrollments_select_authorised` and
 * `class_subjects_select_school` already decide what comes back; a student
 * asking for a class they are not in gets an empty result, not an error.
 */

/** The student's current class, with its form teacher and term. */
export type CurrentEnrollment = Enrollment & {
  class:
    | (SchoolClass & {
        form_teacher:
          (Pick<Teacher, 'id'> & { user: Pick<UserProfile, 'full_name'> | null }) | null;
      })
    | null;
};

export async function getCurrentEnrollment(
  studentId: string,
  sessionId: string,
): Promise<CurrentEnrollment | null> {
  const { data, error } = await supabase
    .from('enrollments')
    .select(
      `*,
       class:classes!enrollments_class_id_fkey (
         *,
         form_teacher:teachers!classes_form_teacher_id_fkey (
           id, user:users!teachers_user_id_fkey (full_name)
         )
       )`,
    )
    .eq('student_id', studentId)
    .eq('academic_session_id', sessionId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw toAppError(error);
  return data as unknown as CurrentEnrollment | null;
}

/**
 * The subjects a class is taught this term, each with its lead teacher.
 *
 * `teacher_assignments` is embedded rather than joined separately so one round
 * trip produces the subject tiles the design shows — code, colour, teacher name.
 */
export interface StudentSubject {
  classSubjectId: string;
  subjectId: string;
  name: string;
  code: string;
  color: string;
  department: string | null;
  isCore: boolean;
  periodsPerWeek: number;
  teacherName: string | null;
  teacherId: string | null;
}

interface ClassSubjectRow {
  id: string;
  periods_per_week: number;
  subject: {
    id: string;
    name: string;
    code: string;
    color: string;
    department: string | null;
    is_core: boolean;
  } | null;
}

interface TeacherAssignmentRow {
  subject_id: string;
  teacher_id: string;
  teacher: { id: string; user: { full_name: string } | null } | null;
}

export async function listClassSubjects(
  classId: string,
  sessionId: string,
): Promise<StudentSubject[]> {
  const [subjectsResult, teachersResult] = await Promise.all([
    supabase
      .from('class_subjects')
      .select(
        `id, periods_per_week,
         subject:subjects!class_subjects_subject_id_fkey (
           id, name, code, color, department, is_core
         )`,
      )
      .eq('class_id', classId)
      .eq('academic_session_id', sessionId),

    supabase
      .from('teacher_assignments')
      .select(
        `subject_id, teacher_id,
         teacher:teachers!teacher_assignments_teacher_id_fkey (
           id, user:users!teachers_user_id_fkey (full_name)
         )`,
      )
      .eq('class_id', classId)
      .eq('academic_session_id', sessionId)
      .eq('is_lead', true),
  ]);

  if (subjectsResult.error) throw toAppError(subjectsResult.error);
  if (teachersResult.error) throw toAppError(teachersResult.error);

  // One lead teacher per subject, guaranteed by teacher_assignments_one_lead.
  const teacherBySubject = new Map<string, TeacherAssignmentRow>(
    (teachersResult.data as unknown as TeacherAssignmentRow[]).map((row) => [row.subject_id, row]),
  );

  return (subjectsResult.data as unknown as ClassSubjectRow[])
    .filter(
      (row): row is ClassSubjectRow & { subject: NonNullable<ClassSubjectRow['subject']> } =>
        row.subject !== null,
    )
    .map((row) => {
      const assignment = teacherBySubject.get(row.subject.id);
      return {
        classSubjectId: row.id,
        subjectId: row.subject.id,
        name: row.subject.name,
        code: row.subject.code,
        color: row.subject.color,
        department: row.subject.department,
        isCore: row.subject.is_core,
        periodsPerWeek: row.periods_per_week,
        teacherName: assignment?.teacher?.user?.full_name ?? null,
        teacherId: assignment?.teacher_id ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One subject's detail, for the course page header. */
export async function getSubject(subjectId: string): Promise<Subject> {
  const { data, error } = await supabase.from('subjects').select('*').eq('id', subjectId).single();

  if (error) throw toAppError(error);
  return data;
}
