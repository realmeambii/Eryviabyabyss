import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { ChildSwitcher } from '@/features/parent';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { formatTime } from '@/shared/utils/format';

import { currentSlot } from '../api/timetable.service';
import { TimetableGrid } from '../components/timetable-grid';
import { useClassTimetable, useSchoolPeriods } from '../hooks/use-timetable';

/**
 * A child's week, as their guardian sees it.
 *
 * The same grid the office edits, minus the teacher names — a parent asking
 * "where is she at eleven on Tuesday" wants the subject and the room. Staffing
 * is the school's business, and putting a named teacher against every period
 * invites a parent to go round the form teacher.
 *
 * `class_id` comes from `current_user_context()`, which already resolved the
 * link between this guardian and this child, so nothing here re-checks it. RLS
 * would return an empty timetable for a child that is not theirs.
 */
export default function ParentTimetablePage() {
  const { children, currentSession } = useCurrentUser();
  const [studentId, setStudentId] = useState('');

  useEffect(() => {
    setStudentId((current) => current || (children[0]?.student_id ?? ''));
  }, [children]);

  const child = children.find((entry) => entry.student_id === studentId) ?? children[0];

  const timetable = useClassTimetable(child?.class_id ?? undefined, currentSession?.id);
  const periods = useSchoolPeriods();

  const slots = useMemo(() => timetable.data ?? [], [timetable.data]);
  const now = useMemo(() => currentSlot(slots), [slots]);

  if (children.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No children linked yet"
        description="Ask the school office to link your account to your child's record."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable"
        description={currentSession ? `${currentSession.name} · Monday to Friday` : undefined}
        actions={
          now?.subject ? (
            <Badge variant="brand">
              Now: {now.subject.name} · until {formatTime(now.ends_at)}
            </Badge>
          ) : null
        }
      />

      <ChildSwitcher children={children} value={child?.student_id ?? ''} onChange={setStudentId} />

      {child && !child.class_id ? (
        <EmptyState
          icon={CalendarDays}
          title="Not in a class yet"
          description={`${child.full_name} has not been enrolled in a class for this term, so there is no timetable to show.`}
        />
      ) : timetable.isPending || periods.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : slots.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing timetabled"
          description="The school has not published a timetable for this class yet."
        />
      ) : (
        <Card>
          <CardContent>
            <TimetableGrid periods={periods.data ?? []} slots={slots} showTeacher={false} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
