import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Student, StudentStatus, UserStatus } from '@/shared/types';

/**
 * Administrator data access.
 *
 * Nothing here filters by school. It does not need to: `app.in_my_school()`
 * appears in every administrator policy, so an administrator's queries are
 * already confined to their own tenant. A `.eq('school_id', …)` on top would
 * be a second copy of that rule, and the copy is the one that goes stale.
 */

export interface SchoolCounts {
  students: number;
  teachers: number;
  parents: number;
  classes: number;
  subjects: number;
}

/**
 * Dashboard tiles.
 *
 * `head: true` with `count: 'exact'` asks Postgres for the count without
 * transferring a single row — five cheap round trips instead of five table
 * scans across the wire.
 */
export async function getSchoolCounts(): Promise<SchoolCounts> {
  const tables = ['students', 'teachers', 'parents', 'classes', 'subjects'] as const;

  const results = await Promise.all(
    tables.map((table) => supabase.from(table).select('id', { count: 'exact', head: true })),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) throw toAppError(failed.error);

  return {
    students: results[0].count ?? 0,
    teachers: results[1].count ?? 0,
    parents: results[2].count ?? 0,
    classes: results[3].count ?? 0,
    subjects: results[4].count ?? 0,
  };
}

/**
 * A row of the student register.
 *
 * Deliberately a projection rather than `Student & {…}`: `search_students()`
 * returns the columns the register renders, not the whole record. Typing it as
 * the full row would mean inventing values for `medical_notes` and friends,
 * and would let a caller read fields the query never fetched.
 *
 * Field names are derived from the generated types, so a column rename in a
 * migration still surfaces here as a compile error.
 */
export interface StudentRow {
  id: Student['id'];
  admission_number: Student['admission_number'];
  admission_date: Student['admission_date'];
  status: Student['status'];
  current_class_id: Student['current_class_id'];
  user: {
    id: string;
    full_name: string;
    email: string;
    avatar_path: string | null;
    phone: string | null;
    /**
     * Whether the *login* works — a different question from `status` above,
     * which is where the pupil stands with the school. A graduated student may
     * still sign in to collect results; a suspended account belongs to someone
     * who is very much still on the roll.
     */
    status: UserStatus;
  } | null;
  current_class: { id: string; name: string; arm: string } | null;
}

export interface StudentQuery {
  search?: string;
  classId?: string;
  status?: StudentStatus;
  page?: number;
  pageSize?: number;
}

export interface StudentPage {
  rows: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * Paged student search.
 *
 * Goes through the `search_students()` RPC rather than a table select, because
 * the filter spans two tables — `admission_number` on `students`, the name on
 * `users` — and PostgREST's root-level `or=` can only reference root columns.
 *
 * The RPC is SECURITY INVOKER, so this is not a way around RLS: an
 * administrator gets the school, a teacher gets only the students they teach.
 * The search term is a bound parameter, so it can no longer corrupt the filter
 * grammar the way an interpolated one could.
 */
export async function listStudents({
  search,
  classId,
  status,
  page = 1,
  pageSize = 25,
}: StudentQuery = {}): Promise<StudentPage> {
  const { data, error } = await supabase.rpc('search_students', {
    p_query: search?.trim() ? search.trim() : undefined,
    p_class_id: classId,
    p_status: status,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) throw toAppError(error);

  const flat = data ?? [];
  // `total_count` is a window function over the pre-LIMIT match set, so it is
  // identical on every row; zero rows means zero matches.
  const total = flat.length > 0 ? Number(flat[0].total_count) : 0;

  // Re-nest into the shape the table component already renders, so the RPC
  // swap stays invisible above this line.
  const rows: StudentRow[] = flat.map((row) => ({
    id: row.id,
    admission_number: row.admission_number,
    admission_date: row.admission_date,
    current_class_id: row.current_class_id,
    status: row.status,
    user: {
      id: row.user_id,
      full_name: row.full_name,
      email: row.email,
      avatar_path: row.avatar_path,
      phone: row.phone,
      status: row.user_status,
    },
    current_class: row.current_class_id
      ? { id: row.current_class_id, name: row.class_name ?? '', arm: row.class_arm ?? '' }
      : null,
  }));

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
