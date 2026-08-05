import { Megaphone, Pin } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadingBlock } from '@/shared/components/loading-screen';
import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatRelative } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';

import { listAnnouncements } from '../api/announcements.service';

/**
 * The school noticeboard.
 *
 * One component for every portal. It needs no role prop and no per-role query,
 * because `announcements_select_audience` already resolves the four audience
 * kinds — school, class, role, individual — against the caller. An
 * administrator sees the whole board; a student sees their school's notices,
 * their own class's, anything addressed to students, and anything addressed to
 * them personally. Same code, same query.
 */
export default function AnnouncementsPage() {
  const { isAuthenticated } = useAuth();

  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.announcements.list({ scope: 'all' }),
    queryFn: () => listAnnouncements({ limit: 100 }),
    enabled: isAuthenticated,
  });

  const announcements = data ?? [];
  const pinned = announcements.filter((a) => a.is_pinned);
  const rest = announcements.filter((a) => !a.is_pinned);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Announcements"
        description="Notices from your school, your class and your teachers."
      />

      {isPending ? <LoadingBlock label="Loading announcements…" /> : null}

      {isError ? (
        <EmptyState
          icon={Megaphone}
          title="Could not load announcements"
          description={error.message}
        />
      ) : null}

      {!isPending && announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Nothing posted yet"
          description="When your school posts a notice it will appear here."
        />
      ) : null}

      {pinned.length > 0 ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
            <Pin className="size-3" aria-hidden />
            Pinned
          </h2>
          {pinned.map((announcement) => (
            <AnnouncementCard key={announcement.id} announcement={announcement} pinned />
          ))}
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section className="space-y-3">
          {pinned.length > 0 ? (
            <h2 className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">Earlier</h2>
          ) : null}
          {rest.map((announcement) => (
            <AnnouncementCard key={announcement.id} announcement={announcement} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

type Announcement = Awaited<ReturnType<typeof listAnnouncements>>[number];

function AnnouncementCard({
  announcement,
  pinned = false,
}: {
  announcement: Announcement;
  pinned?: boolean;
}) {
  const tone =
    announcement.priority === 'urgent'
      ? 'danger'
      : announcement.priority === 'important'
        ? 'warning'
        : 'neutral';

  return (
    <Card className={cn(pinned && 'border-brand-border')}>
      <CardContent className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {announcement.priority !== 'normal' ? (
            <Badge variant={tone}>{announcement.priority}</Badge>
          ) : null}
          {announcement.audience === 'class' && announcement.class ? (
            <Badge variant="neutral">
              {announcement.class.name}
              {announcement.class.arm}
            </Badge>
          ) : null}
          {announcement.audience === 'school' ? (
            <Badge variant="neutral">Whole school</Badge>
          ) : null}
        </div>

        <h3 className="text-[15px] leading-snug font-bold tracking-tight text-ink">
          {announcement.title}
        </h3>

        <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">
          {announcement.body}
        </p>

        <div className="flex items-center gap-2 pt-1">
          <UserAvatar
            fullName={announcement.author?.full_name}
            avatarPath={announcement.author?.avatar_path}
            className="size-6"
          />
          <p className="text-[11.5px] text-ink-3">
            {announcement.author?.full_name ?? 'School admin'} ·{' '}
            {formatRelative(announcement.publish_at)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
