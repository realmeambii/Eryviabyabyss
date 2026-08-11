import { Plus } from 'lucide-react';

import { SubjectBadge } from '@/shared/components/subject-badge';
import { WEEKDAYS } from '@/shared/lib/constants';
import { cn } from '@/shared/utils/cn';
import { formatTime } from '@/shared/utils/format';

import type { SchoolPeriod, TimetableSlotWithContext } from '../api/timetable.service';

/**
 * The weekly grid, drawn against the school's bell schedule.
 *
 * A true grid rather than five lists, because a grid is what the office edits
 * and what a parent reads — both want to see the shape of a week, including its
 * holes. The teacher's own timetable stays a list: their periods are spread
 * across classes and never line up, so a grid there would be mostly empty.
 *
 * A lesson placed off the bells — a double before an exam, a Saturday clinic —
 * has no row to sit in. Those are collected underneath rather than dropped,
 * because silently hiding a lesson from the timetable is how a class turns up
 * to an empty room.
 */
export function TimetableGrid({
  periods,
  slots,
  onSelect,
  emptyLabel = 'Free',
  showTeacher = true,
}: {
  periods: SchoolPeriod[];
  slots: TimetableSlotWithContext[];
  /** Makes cells interactive. Omit for a read-only grid. */
  onSelect?: (args: { day: number; period: SchoolPeriod; slot?: TimetableSlotWithContext }) => void;
  emptyLabel?: string;
  showTeacher?: boolean;
}) {
  const at = (day: number, period: SchoolPeriod) =>
    slots.find(
      (slot) =>
        slot.day_of_week === day && slot.starts_at.slice(0, 5) === period.starts_at.slice(0, 5),
    );

  const onGrid = new Set(periods.map((period) => period.starts_at.slice(0, 5)));
  const offGrid = slots.filter(
    (slot) => !onGrid.has(slot.starts_at.slice(0, 5)) && slot.day_of_week <= 5,
  );

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-1.5 text-left">
          <thead>
            <tr>
              <th className="w-24 text-[11px] font-bold tracking-wide text-ink-3 uppercase">
                Period
              </th>
              {WEEKDAYS.slice(0, 5).map((day) => (
                <th
                  key={day.value}
                  className="text-[11px] font-bold tracking-wide text-ink-3 uppercase"
                >
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {periods.map((period) => (
              <tr key={period.id}>
                <th className="align-middle">
                  <span className="block font-mono text-[11px] text-ink-3">
                    {formatTime(period.starts_at)}
                  </span>
                  <span className="block font-mono text-[10.5px] text-ink-3">
                    {formatTime(period.ends_at)}
                  </span>
                </th>

                {WEEKDAYS.slice(0, 5).map((day) => {
                  if (period.is_break) {
                    return (
                      <td key={day.value}>
                        <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-border text-[12px] text-ink-3">
                          {period.label ?? 'Break'}
                        </div>
                      </td>
                    );
                  }

                  const slot = at(day.value, period);
                  const interactive = Boolean(onSelect);

                  const body = slot ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <SubjectBadge
                          code={slot.subject?.code ?? '—'}
                          color={slot.subject?.color ?? '#64748b'}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">
                          {slot.subject?.name ?? 'Subject'}
                        </span>
                      </div>
                      {showTeacher ? (
                        <p className="truncate text-[11px] text-ink-3">
                          {slot.teacher?.user?.full_name ?? 'No teacher'}
                          {slot.room ? ` · ${slot.room}` : ''}
                        </p>
                      ) : slot.room ? (
                        <p className="truncate text-[11px] text-ink-3">{slot.room}</p>
                      ) : null}
                    </>
                  ) : (
                    <span className="flex items-center justify-center gap-1 text-[12px] text-ink-3">
                      {interactive ? <Plus className="size-3.5" aria-hidden /> : null}
                      {interactive ? 'Add' : emptyLabel}
                    </span>
                  );

                  if (!interactive) {
                    return (
                      <td key={day.value}>
                        <div
                          className={cn(
                            'flex h-16 flex-col justify-center gap-1 rounded-lg border px-2',
                            slot ? 'border-border bg-card' : 'border-dashed border-border',
                          )}
                        >
                          {body}
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td key={day.value}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect?.({ day: day.value, period, slot });
                        }}
                        className={cn(
                          'flex h-16 w-full cursor-pointer flex-col justify-center gap-1 rounded-lg border px-2 text-left transition-colors',
                          slot
                            ? 'border-border bg-card hover:border-brand-border'
                            : 'border-dashed border-border hover:border-brand-border hover:bg-brand-soft/40',
                        )}
                      >
                        {body}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {offGrid.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-[12px] font-semibold text-ink-2">Outside the bell schedule</p>
          <p className="pt-0.5 text-[11.5px] text-ink-3">
            These sit at times the school's periods do not cover, so they have no row above.
          </p>
          <ul className="space-y-1 pt-2">
            {offGrid.map((slot) => (
              <li key={slot.id} className="text-[12.5px] text-ink">
                {WEEKDAYS[slot.day_of_week - 1]?.label} {formatTime(slot.starts_at)}–
                {formatTime(slot.ends_at)} · {slot.subject?.name ?? 'Subject'}
                {slot.teacher?.user?.full_name ? ` · ${slot.teacher.user.full_name}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
