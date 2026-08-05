import { CalendarDays, FileSpreadsheet, ScrollText, UsersRound } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { ShortcutGrid, type Shortcut } from '@/shared/components/shortcut-grid';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { TERM_LABEL } from '@/shared/lib/constants';
import { greeting } from '@/shared/utils/format';

const SHORTCUTS: Shortcut[] = [
  {
    to: '/parent/children',
    icon: UsersRound,
    title: 'My children',
    description: 'Each child’s class, subjects and teachers.',
  },
  {
    to: '/parent/grades',
    icon: FileSpreadsheet,
    title: 'Results',
    description: 'Continuous assessment and end-of-term reports.',
  },
  {
    to: '/parent/attendance',
    icon: ScrollText,
    title: 'Attendance',
    description: 'Days present, late and absent this term.',
  },
  {
    to: '/parent/timetable',
    icon: CalendarDays,
    title: 'Timetable',
    description: 'What your child is doing, and when.',
  },
];

export default function ParentDashboard() {
  const { user, school, currentSession, children } = useCurrentUser();

  return (
    <div className="space-y-7">
      <PageHeader
        title={`${greeting()}, ${user.last_name}`}
        description={
          currentSession
            ? `${school?.name ?? 'Your school'} · ${currentSession.name} · ${TERM_LABEL[currentSession.term]}`
            : school?.name
        }
        actions={<Badge variant="brand">Parent</Badge>}
      />

      {/* Children come straight from current_user_context() — the same RPC
          that bootstraps the session, so no extra round trip. */}
      {children.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {children.map((child) => (
            <Card key={child.student_id}>
              <CardContent className="flex items-center gap-3.5">
                <UserAvatar
                  fullName={child.full_name}
                  avatarPath={child.avatar_path}
                  className="size-10"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{child.full_name}</p>
                  <p className="text-[12.5px] text-ink-3">{child.admission_number}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={UsersRound}
          title="No children linked yet"
          description="Ask the school office to link your account to your child's record."
        />
      )}

      <ShortcutGrid shortcuts={SHORTCUTS} />
    </div>
  );
}
