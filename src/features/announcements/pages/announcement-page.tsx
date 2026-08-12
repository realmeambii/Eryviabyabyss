import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Megaphone } from 'lucide-react';

import { useAuth } from '@/features/auth';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { RichText } from '@/shared/components/rich-text';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { queryKeys } from '@/shared/lib/query-keys';
import { PORTAL_BASE } from '@/shared/lib/portal-href';
import { formatDateTime } from '@/shared/utils/format';

import { getAnnouncement } from '../api/announcements.service';

/**
 * One announcement.
 *
 * Exists because notifications link to it. The trigger that fires when an
 * announcement is published writes an `action_url` pointing at this page, and
 * for a long time there was no page at the other end — every announcement
 * notification in the table, several thousand of them, led to a 404.
 *
 * Whether the caller may read it is `announcements_select_audience`, not this
 * component: a notification is only ever created for somebody in the audience,
 * but a guessed id from anybody else returns no row and lands on the not-found
 * state below rather than an error.
 */
export default function AnnouncementPage() {
  const { announcementId } = useParams<{ announcementId: string }>();
  const { primaryRole } = useAuth();
  const base = primaryRole ? PORTAL_BASE[primaryRole] : '';

  const announcement = useQuery({
    queryKey: queryKeys.announcements.detail(announcementId ?? 'none'),
    queryFn: () => getAnnouncement(announcementId!),
    enabled: Boolean(announcementId),
    retry: false,
  });

  if (announcement.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (announcement.isError || !announcement.data) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Announcement not found"
        description="It may have been withdrawn, or it was never addressed to you."
        action={
          <Button asChild variant="secondary">
            <Link to={`${base}/announcements`}>
              <ArrowLeft className="size-4" aria-hidden />
              All announcements
            </Link>
          </Button>
        }
      />
    );
  }

  const row = announcement.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title={row.title}
        description={row.publish_at ? formatDateTime(row.publish_at) : 'Not yet published'}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to={`${base}/announcements`}>
              <ArrowLeft className="size-4" aria-hidden />
              All announcements
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {row.author ? (
              <span className="flex items-center gap-2">
                <UserAvatar
                  fullName={row.author.full_name}
                  avatarPath={row.author.avatar_path}
                  className="size-8"
                />
                <span className="text-[13px] font-semibold text-ink">{row.author.full_name}</span>
              </span>
            ) : null}

            {row.priority && row.priority !== 'normal' ? (
              <Badge variant={row.priority === 'urgent' ? 'danger' : 'warning'}>
                {row.priority}
              </Badge>
            ) : null}

            {row.status !== 'published' ? <Badge variant="neutral">{row.status}</Badge> : null}
          </div>

          <RichText html={row.body} />
        </CardContent>
      </Card>
    </div>
  );
}
