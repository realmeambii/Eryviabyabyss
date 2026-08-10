import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';

import { useMyTimetable, useTeacherScope } from '@/features/teacher';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { WEEKDAYS } from '@/shared/lib/constants';
import { cn } from '@/shared/utils/cn';
import { className as formatClassName, formatTime } from '@/shared/utils/format';

import { byWeekday, currentSlot } from '../api/timetable.service';

/**
 * A teacher's week, across every class they take.
 *
 * A column per weekday rather than a time grid. Periods are not aligned across
 * classes — a double on Tuesday afternoon does not line up with anything on
 * Monday — so a true grid would be mostly empty cells with the occasional
 * row-span, which is harder to read than five plain lists.
 *
 * The current period is highlighted from the same `currentSlot()` the dashboard
 * uses, so the two screens cannot disagree about what is happening now.
 */
export default function TeacherTimetablePage() {
  const scope = useTeacherScope();
  const timetable = useMyTimetable();

  const slots = useMemo(() => timetable.data ?? [], [timetable.data]);
  const grouped = useMemo(() => byWeekday(slots), [slots]);
  const now = currentSlot(slots);

  const today = new Date().getDay() === 0 ? 7 : new Date().getDay();

  const teachingMinutes = useMemo(
    () =>
      slots
        .filter((slot) => !slot.is_break)
        .reduce((total, slot) => {
          const [sh = '0', sm = '0'] = slot.starts_at.split(':');
          const [eh = '0', em = '0'] = slot.ends_at.split(':');
          return total + (Number(eh) * 60 + Number(em) - (Number(sh) * 60 + Number(sm)));
        }, 0),
    [slots],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My timetable"
        description={
          timetable.isPending
            ? 'Your week, period by period.'
            : `${slots.filter((slot) => !slot.is_break).length} periods · ${Math.round(teachingMinutes / 60)} hours a week`
        }
      />

      {timetable.isPending || scope.isPending ? (
        <div className="grid gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-72 w-full rounded-2xl" />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing timetabled"
          description={
            scope.isUnassigned
              ? 'You have no classes this term, so there is nothing to timetable.'
              : 'An administrator has not put your classes on the timetable yet.'
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          {WEEKDAYS.slice(0, 5).map((day) => {
            const periods = grouped.get(day.value) ?? [];
            const isToday = day.value === today;

            return (
              <section key={day.value} className="space-y-2">
                <h2
                  className={cn(
                    'flex items-center gap-2 text-[13px] font-bold tracking-wide uppercase',
                    isToday ? 'text-brand' : 'text-ink-3',
                  )}
                >
                  {day.label}
                  {isToday ? <Badge variant="brand">Today</Badge> : null}
                </h2>

                {periods.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-ink-3">
                    Free
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {periods.map((slot) => {
                      const isNow = now?.id === slot.id;
                      const slotClass = scope.classes.find((row) => row.id === slot.class_id);

                      if (slot.is_break) {
                        return (
                          <li
                            key={slot.id}
                            className="rounded-xl border border-dashed border-border px-3 py-2 text-center"
                          >
                            <p className="font-mono text-[11px] text-ink-3">
                              {formatTime(slot.starts_at)}
                            </p>
                            <p className="text-[12.5px] font-medium text-ink-3">
                              {slot.label ?? 'Break'}
                            </p>
                          </li>
                        );
                      }

                      return (
                        <li key={slot.id}>
                          <Card
                            className={cn(
                              'p-3 transition-colors',
                              isNow && 'border-brand-border bg-brand-soft/40',
                            )}
                          >
                            <CardContent className="space-y-1.5 p-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[11px] whitespace-nowrap text-ink-3">
                                  {formatTime(slot.starts_at)}–{formatTime(slot.ends_at)}
                                </span>
                                {isNow ? <Badge variant="brand">Now</Badge> : null}
                              </div>

                              <div className="flex items-center gap-2">
                                <SubjectBadge
                                  code={slot.subject?.code ?? '—'}
                                  color={slot.subject?.color ?? '#64748b'}
                                  size="sm"
                                />
                                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                                  {slot.subject?.name ?? 'Subject'}
                                </span>
                              </div>

                              <p className="text-[12px] text-ink-3">
                                {slotClass ? (
                                  <Link
                                    to={`/teacher/classes/${slotClass.id}`}
                                    className="hover:text-brand"
                                  >
                                    {formatClassName(slotClass.name, slotClass.arm)}
                                  </Link>
                                ) : (
                                  'Class'
                                )}
                                {slot.room ? ` · ${slot.room}` : ''}
                              </p>
                            </CardContent>
                          </Card>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
