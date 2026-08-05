import { useQuery } from '@tanstack/react-query';
import { BookOpen, GraduationCap, Library, Megaphone, Users, UsersRound } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { PageHeader } from '@/shared/components/page-header';
import { ShortcutGrid, type Shortcut } from '@/shared/components/shortcut-grid';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { TERM_LABEL } from '@/shared/lib/constants';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatNumber, greeting } from '@/shared/utils/format';

import { getSchoolCounts } from '../api/admin.service';

const SHORTCUTS: Shortcut[] = [
  {
    to: '/admin/students',
    icon: GraduationCap,
    title: 'Students',
    description: 'Admissions, enrolment and student records.',
  },
  {
    to: '/admin/teachers',
    icon: Users,
    title: 'Teachers',
    description: 'Staff records and class-subject assignments.',
  },
  {
    to: '/admin/classes',
    icon: Library,
    title: 'Classes',
    description: 'Class arms, form teachers and the curriculum.',
  },
  {
    to: '/admin/announcements',
    icon: Megaphone,
    title: 'Announcements',
    description: 'Notices to the whole school, a class or a role.',
  },
];

export default function AdminDashboard() {
  const { user, school, currentSession } = useCurrentUser();

  const counts = useQuery({
    queryKey: queryKeys.school.detail(school?.id ?? 'none'),
    queryFn: getSchoolCounts,
    enabled: Boolean(school?.id),
  });

  const tiles = [
    { label: 'Students', value: counts.data?.students, icon: GraduationCap },
    { label: 'Teachers', value: counts.data?.teachers, icon: Users },
    { label: 'Parents', value: counts.data?.parents, icon: UsersRound },
    { label: 'Classes', value: counts.data?.classes, icon: Library },
    { label: 'Subjects', value: counts.data?.subjects, icon: BookOpen },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        title={`${greeting()}, ${user.first_name}`}
        description={
          currentSession
            ? `${school?.name ?? 'Your school'} · ${currentSession.name} · ${TERM_LABEL[currentSession.term]}`
            : school?.name
        }
        actions={<Badge variant="brand">Administrator</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Card key={tile.label}>
              <CardContent className="space-y-2 px-4 py-4">
                <span className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                  <Icon className="size-3.5" aria-hidden />
                  {tile.label}
                </span>
                {counts.isPending ? (
                  <Skeleton className="h-7 w-14" />
                ) : (
                  <p className="text-[26px] leading-none font-extrabold tracking-tight text-ink">
                    {formatNumber(tile.value ?? 0)}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ShortcutGrid shortcuts={SHORTCUTS} />
    </div>
  );
}
