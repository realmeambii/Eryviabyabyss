import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate, TimetableSlot } from '@/shared/types';

/**
 * Timetable data access.
 *
 * Clash prevention lives in the database: `timetable_slots` carries GiST
 * EXCLUDE constraints that make a double-booked class or teacher impossible to
 * insert. A write that clashes comes back as SQLSTATE 23P01, which
 * `toAppError()` turns into "That slot clashes with an existing one" — so the
 * UI never has to run its own overlap check.
 */

export type TimetableSlotWithContext = TimetableSlot & {
  subject: { id: string; name: string; code: string; color: string } | null;
  teacher: { id: string; user: { full_name: string } | null } | null;
};

const SELECT = `*,
  subject:subjects!timetable_slots_subject_id_fkey (id, name, code, color),
  teacher:teachers!timetable_slots_teacher_id_fkey (
    id, user:users!teachers_user_id_fkey (full_name)
  )`;

export async function getClassTimetable(
  classId: string,
  sessionId?: string,
): Promise<TimetableSlotWithContext[]> {
  let query = supabase
    .from('timetable_slots')
    .select(SELECT)
    .eq('class_id', classId)
    .order('day_of_week', { ascending: true })
    .order('starts_at', { ascending: true });

  if (sessionId) query = query.eq('academic_session_id', sessionId);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data;
}

export async function getTeacherTimetable(
  teacherId: string,
  sessionId?: string,
): Promise<TimetableSlotWithContext[]> {
  let query = supabase
    .from('timetable_slots')
    .select(SELECT)
    .eq('teacher_id', teacherId)
    .order('day_of_week', { ascending: true })
    .order('starts_at', { ascending: true });

  if (sessionId) query = query.eq('academic_session_id', sessionId);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data;
}

/** Group a flat slot list into the five weekday columns the grid renders. */
export function byWeekday<T extends { day_of_week: number }>(slots: T[]): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (let day = 1; day <= 5; day += 1) grouped.set(day, []);

  for (const slot of slots) {
    const bucket = grouped.get(slot.day_of_week);
    if (bucket) bucket.push(slot);
  }

  return grouped;
}

/** The lesson happening right now, if any — drives the "up next" card. */
export function currentSlot<T extends { day_of_week: number; starts_at: string; ends_at: string }>(
  slots: T[],
  now = new Date(),
): T | undefined {
  const isoDay = now.getDay() === 0 ? 7 : now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();

  return slots.find((slot) => {
    if (slot.day_of_week !== isoDay) return false;
    return toMinutes(slot.starts_at) <= minutes && minutes < toMinutes(slot.ends_at);
  });
}

function toMinutes(time: string): number {
  const [hours = '0', mins = '0'] = time.split(':');
  return Number(hours) * 60 + Number(mins);
}

// ── The bell schedule ───────────────────────────────────────────────────────

export type SchoolPeriod = Tables<'school_periods'>;

/**
 * The school's periods, in order.
 *
 * Read by everyone: a pupil's timetable renders against this grid, and the row
 * a lesson sits in is decided by matching times rather than a foreign key —
 * the office is allowed to place a lesson off the bells, and a key would
 * forbid it.
 */
export async function listPeriods(schoolId: string): Promise<SchoolPeriod[]> {
  const { data, error } = await supabase
    .from('school_periods')
    .select('*')
    .eq('school_id', schoolId)
    .order('position', { ascending: true });

  if (error) throw toAppError(error);
  return data;
}

export async function upsertPeriod(input: TablesInsert<'school_periods'>): Promise<SchoolPeriod> {
  const { data, error } = await supabase
    .from('school_periods')
    .upsert(input, { onConflict: 'school_id,position' })
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export async function deletePeriod(id: string): Promise<void> {
  const { error } = await supabase.from('school_periods').delete().eq('id', id);
  if (error) throw toAppError(error);
}

// ── Claiming a period ───────────────────────────────────────────────────────

export interface AvailabilityCell {
  period_id: string;
  period_position: number;
  starts_at: string;
  ends_at: string;
  is_break: boolean;
  day_of_week: number;
  slot_id: string | null;
  taken_subject: string | null;
  taken_by_me: boolean;
  claimed_by_me: boolean;
  teacher_busy: boolean;
}

/**
 * The weekly grid for a class, marked up with what a teacher may take.
 *
 * One RPC rather than a slot list the client reasons over, because two of the
 * three facts a cell needs are not in the caller's own reads: whether the class
 * is already busy in a subject they cannot see, and whether *they* are teaching
 * another class at that hour. It answers only for a class the caller teaches.
 */
export async function getAvailability(
  classId: string,
  sessionId: string,
): Promise<AvailabilityCell[]> {
  const { data, error } = await supabase.rpc('timetable_availability', {
    p_class_id: classId,
    p_session_id: sessionId,
  });

  if (error) throw toAppError(error);
  return data ?? [];
}

/**
 * Take a period.
 *
 * No pre-flight check, deliberately. Two teachers deciding at the same moment
 * would both read "free" and both write; the exclusion constraints settle it
 * under concurrency and the loser gets 23P01, which `toAppError()` already
 * renders as a clash. A read-then-write here would be slower *and* wrong.
 *
 * `claimed_by` is what marks the row as the teacher's own rather than the
 * office's, and the insert policy requires it to be them.
 */
export async function claimPeriod(input: {
  schoolId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  userId: string;
  sessionId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  room?: string | null;
}): Promise<TimetableSlot> {
  const { data, error } = await supabase
    .from('timetable_slots')
    .insert({
      school_id: input.schoolId,
      class_id: input.classId,
      subject_id: input.subjectId,
      teacher_id: input.teacherId,
      academic_session_id: input.sessionId,
      day_of_week: input.dayOfWeek,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      room: input.room ?? null,
      claimed_by: input.userId,
    })
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/** Give a claimed period back. Only ever the caller's own — RLS sees to that. */
export async function releaseSlot(slotId: string): Promise<void> {
  const { error } = await supabase.from('timetable_slots').delete().eq('id', slotId);
  if (error) throw toAppError(error);
}

// ── The office's editor ─────────────────────────────────────────────────────

/**
 * Place or move a lesson. Administrators only — the policies enforce it.
 *
 * Not restricted to the bell schedule: an administrator may put a double period
 * before an exam or a Saturday clinic wherever it belongs. The clash
 * constraints still apply, because two lessons in one room-hour is a mistake
 * whoever makes it.
 */
export async function placeSlot(input: TablesInsert<'timetable_slots'>): Promise<TimetableSlot> {
  const { data, error } = await supabase.from('timetable_slots').insert(input).select().single();

  if (error) throw toAppError(error);
  return data;
}

export async function updateSlot(
  id: string,
  patch: TablesUpdate<'timetable_slots'>,
): Promise<TimetableSlot> {
  const { data, error } = await supabase
    .from('timetable_slots')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export async function deleteSlot(id: string): Promise<void> {
  const { error } = await supabase.from('timetable_slots').delete().eq('id', id);
  if (error) throw toAppError(error);
}

/**
 * Which teachers may take a given subject in a given class.
 *
 * The office should not be able to timetable a chemistry teacher for a French
 * lesson by accident, so the picker is fed from `teacher_assignments` rather
 * than from every member of staff.
 */
export async function listEligibleTeachers(
  classId: string,
  subjectId: string,
  sessionId: string,
): Promise<{ id: string; full_name: string }[]> {
  const { data, error } = await supabase
    .from('teacher_assignments')
    .select('teacher:teachers!inner (id, user:users!teachers_user_id_fkey (full_name))')
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .eq('academic_session_id', sessionId);

  if (error) throw toAppError(error);

  const rows = data as unknown as {
    teacher: { id: string; user: { full_name: string } | null } | null;
  }[];

  return rows
    .filter((row) => row.teacher !== null)
    .map((row) => ({
      id: row.teacher!.id,
      full_name: row.teacher!.user?.full_name ?? 'Unnamed teacher',
    }));
}
