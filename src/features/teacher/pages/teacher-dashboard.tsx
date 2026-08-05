import { CalendarDays, ClipboardList, FileSpreadsheet, Users } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { PageHeader } from '@/shared/components/page-header';
import { ShortcutGrid, type Shortcut } from '@/shared/components/shortcut-grid';
import { Badge } from '@/shared/components/ui/badge';
import { TERM_LABEL } from '@/shared/lib/constants';
import { greeting } from '@/shared/utils/format';

const SHORTCUTS: Shortcut[] = [
  {
    to: '/teacher/classes',
    icon: Users,
    title: 'My classes',
    description: 'The classes and subjects assigned to you this term.',
  },
  {
    to: '/teacher/assignments',
    icon: ClipboardList,
    title: 'Assignments',
    description: 'Set new work and track who has handed in.',
  },
  {
    to: '/teacher/grading',
    icon: FileSpreadsheet,
    title: 'Grading',
    description: 'Mark submissions and publish results to the gradebook.',
  },
  {
    to: '/teacher/timetable',
    icon: CalendarDays,
    title: 'Timetable',
    description: 'Your week, period by period, across every class.',
  },
];

export default function TeacherDashboard() {
  const { user, school, currentSession } = useCurrentUser();

  return (
    <div className="space-y-7">
      <PageHeader
        title={`${greeting()}, ${user.last_name}`}
        description={
          currentSession
            ? `${school?.name ?? 'Your school'} · ${currentSession.name} · ${TERM_LABEL[currentSession.term]}`
            : school?.name
        }
        actions={<Badge variant="brand">Teacher</Badge>}
      />
      <ShortcutGrid shortcuts={SHORTCUTS} />
    </div>
  );
}
