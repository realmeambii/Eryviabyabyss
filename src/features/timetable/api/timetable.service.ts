import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { TimetableSlot } from '@/shared/types';

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
  return data as unknown as TimetableSlotWithContext[];
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
  return data as unknown as TimetableSlotWithContext[];
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
