import { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';

import { useStudentContext, useStudentTimetable } from '@/features/student';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Badge } from '@/shared/components/ui/badge';
import { Card } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { WEEKDAYS } from '@/shared/lib/constants';
import { cn } from '@/shared/utils/cn';
import { formatTime } from '@/shared/utils/format';

import { byWeekday, currentSlot, type TimetableSlotWithContext } from '../api/timetable.service';

/**
 * The weekly timetable.
 *
 * Monday–Friday as columns, periods flowing down each. The current period is
 * highlighted, which is the one thing a student actually looks for.
 *
 * Slots are grouped client-side rather than in SQL: the query already returns
 * the whole week ordered by day and start time, so a second round trip per
 * column would buy nothing.
 */
export default function StudentTimetablePage() {
  const { className, isUnenrolled, isLoading: contextLoading } = useStudentContext();
  const { data, isPending, isError, error } = useStudentTimetable();

  const slots = useMemo(() => data ?? [], [data]);
  const grouped = useMemo(() => byWeekday(slots), [slots]);
  const now = useMemo(() => currentSlot(slots), [slots]);

  const loading = contextLoading || isPending;
  const weekdays = WEEKDAYS.filter((day) => day.value <= 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly timetable"
        description={className ? `${className} · Monday to Friday` : 'Your week, period by period.'}
        actions={
          now?.subject ? (
            <Badge variant="brand">
              Now: {now.subject.name} · until {formatTime(now.ends_at)}
            </Badge>
          ) : null
        }
      />

      {isUnenrolled ? (
        <EmptyState
          icon={CalendarDays}
          title="You are not in a class yet"
          description="Your timetable appears once the school office places you in a class."
        />
      ) : null}

      {isError ? (
        <EmptyState
          icon={CalendarDays}
          title="Could not load your timetable"
          description={error.message}
        />
      ) : null}

      {loading && !isUnenrolled ? <Skeleton className="h-96 w-full rounded-xl" /> : null}

      {!loading && slots.length === 0 && !isUnenrolled ? (
        <EmptyState
          icon={CalendarDays}
          title="No timetable published"
          description="The timetable office has not published periods for your class this term."
        />
      ) : null}

      {!loading && slots.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {weekdays.map((day) => {
            const daySlots = grouped.get(day.value) ?? [];
            const isToday = new Date().getDay() === day.value;

            return (
              <section key={day.value} className="space-y-2">
                <h2
                  className={cn(
                    'px-1 text-[10.5px] font-bold tracking-wider uppercase',
                    isToday ? 'text-brand' : 'text-ink-3',
                  )}
                >
                  {day.label}
                  {isToday ? ' · today' : ''}
                </h2>

                <div className="space-y-2">
                  {daySlots.length === 0 ? (
                    <Card className="px-3 py-4 text-center text-[12.5px] text-ink-3">
                      No periods
                    </Card>
                  ) : (
                    daySlots.map((slot) => (
                      <SlotCard key={slot.id} slot={slot} isNow={now?.id === slot.id} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SlotCard({ slot, isNow }: { slot: TimetableSlotWithContext; isNow: boolean }) {
  if (slot.is_break) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-[11.5px] font-semibold text-ink-3">
        {slot.label ?? 'Break'} · {formatTime(slot.starts_at)}
      </div>
    );
  }

  return (
    <Card
      className={cn(
        'space-y-1 px-3 py-2.5 transition-colors',
        isNow && 'border-brand-border bg-brand-soft',
      )}
      style={
        slot.subject && !isNow
          ? { borderLeftWidth: 3, borderLeftColor: slot.subject.color }
          : undefined
      }
    >
      <p className="text-[11px] font-semibold text-ink-3">
        {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
      </p>
      <p className={cn('truncate text-[13px] font-bold', isNow ? 'text-brand' : 'text-ink')}>
        {slot.subject?.name ?? 'Subject'}
      </p>
      <p className="truncate text-[11.5px] text-ink-3">
        {slot.teacher?.user?.full_name ?? 'Teacher not assigned'}
        {slot.room ? ` · ${slot.room}` : ''}
      </p>
    </Card>
  );
}
