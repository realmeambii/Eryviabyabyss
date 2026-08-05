import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { AttendanceRecord, AttendanceStatus, TablesInsert } from '@/shared/types';

/**
 * Attendance data access.
 *
 * The register is a batch operation: a form teacher marks thirty students in
 * one action. `upsert` against the partial unique indexes on
 * `attendance_records` makes that idempotent — re-saving a register corrects
 * the existing rows instead of duplicating them.
 */

export interface AttendanceRange {
  from?: string;
  to?: string;
}

export async function listStudentAttendance(
  studentId: string,
  range: AttendanceRange = {},
): Promise<AttendanceRecord[]> {
  let query = supabase
    .from('attendance_records')
    .select('*')
    .eq('student_id', studentId)
    .order('taken_on', { ascending: false });

  if (range.from) query = query.gte('taken_on', range.from);
  if (range.to) query = query.lte('taken_on', range.to);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data;
}

export async function getRegister(classId: string, date: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('class_id', classId)
    .eq('taken_on', date);

  if (error) throw toAppError(error);
  return data;
}

export interface RegisterEntry {
  studentId: string;
  status: AttendanceStatus;
  minutesLate?: number | null;
  note?: string | null;
}

/** Save a whole register in one round trip. */
export async function saveRegister(args: {
  schoolId: string;
  classId: string;
  sessionId: string;
  date: string;
  recordedBy: string | null;
  entries: RegisterEntry[];
}): Promise<void> {
  const rows: TablesInsert<'attendance_records'>[] = args.entries.map((entry) => ({
    school_id: args.schoolId,
    class_id: args.classId,
    academic_session_id: args.sessionId,
    student_id: entry.studentId,
    taken_on: args.date,
    status: entry.status,
    // The CHECK constraint only allows minutes_late on a 'late' row.
    minutes_late: entry.status === 'late' ? (entry.minutesLate ?? 0) : null,
    note: entry.note ?? null,
    recorded_by: args.recordedBy,
  }));

  const { error } = await supabase
    .from('attendance_records')
    .upsert(rows, { onConflict: 'student_id,taken_on', ignoreDuplicates: false });

  if (error) throw toAppError(error);
}

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  /** Present + late, as a percentage of days recorded. */
  attendanceRate: number;
}

export function summarise(records: AttendanceRecord[]): AttendanceSummary {
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const record of records) counts[record.status] += 1;

  const total = records.length;
  const attended = counts.present + counts.late;

  return {
    total,
    ...counts,
    attendanceRate: total === 0 ? 0 : Math.round((attended / total) * 1000) / 10,
  };
}
