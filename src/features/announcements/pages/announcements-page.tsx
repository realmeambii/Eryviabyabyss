import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Megaphone, Pencil, Pin, Plus, Send, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { useAuth, useCurrentUser } from '@/features/auth';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Button } from '@/shared/components/ui/button';
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
import { AnnouncementComposer } from '../components/announcement-composer';
import { useAnnouncementMutations } from '../hooks/use-announcements';

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
  const { isAuthenticated, isAdministrator, isTeacher } = useAuth();
  const { user } = useCurrentUser();
  const [params, setParams] = useSearchParams();

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);

  const { publish, remove } = useAnnouncementMutations();
  const canPost = isAdministrator || isTeacher;

  // `?new=1` from a dashboard quick action opens the composer straight away.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setComposing(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

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
        description={
          canPost
            ? 'Notices you have posted, and everything addressed to you.'
            : 'Notices from your school, your class and your teachers.'
        }
        actions={
          canPost ? (
            <Button
              onClick={() => {
                setComposing(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              New notice
            </Button>
          ) : null
        }
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
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              pinned
              isMine={announcement.author_id === user.id}
              onEdit={setEditing}
              onDelete={setDeleting}
              onPublish={(id) => {
                publish.mutate(id);
              }}
              isPublishing={publish.isPending}
            />
          ))}
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section className="space-y-3">
          {pinned.length > 0 ? (
            <h2 className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">Earlier</h2>
          ) : null}
          {rest.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              isMine={announcement.author_id === user.id}
              onEdit={setEditing}
              onDelete={setDeleting}
              onPublish={(id) => {
                publish.mutate(id);
              }}
              isPublishing={publish.isPending}
            />
          ))}
        </section>
      ) : null}

      {canPost ? (
        <AnnouncementComposer
          open={composing || editing !== null}
          announcement={editing}
          onOpenChange={(open) => {
            if (open) return;
            setComposing(false);
            setEditing(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete “${deleting?.title ?? 'this notice'}”?`}
        description="It disappears from every board that shows it. Notifications already sent are not recalled — people who have read it will remember."
        confirmLabel="Delete notice"
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
            },
          });
        }}
      />
    </div>
  );
}

type Announcement = Awaited<ReturnType<typeof listAnnouncements>>[number];

function AnnouncementCard({
  announcement,
  pinned = false,
  isMine = false,
  onEdit,
  onDelete,
  onPublish,
  isPublishing = false,
}: {
  announcement: Announcement;
  pinned?: boolean;
  /**
   * Whether the viewer wrote it. `announcements_update_author_or_admin` allows
   * an administrator to edit anyone's, but the controls are shown only to the
   * author — an administrator quietly rewriting a teacher's notice under the
   * teacher's byline is not something the board should invite.
   */
  isMine?: boolean;
  onEdit?: (announcement: Announcement) => void;
  onDelete?: (announcement: Announcement) => void;
  onPublish?: (id: string) => void;
  isPublishing?: boolean;
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
          {announcement.status !== 'published' ? (
            <Badge variant="warning">{announcement.status}</Badge>
          ) : null}

          {isMine ? (
            <div className="ml-auto flex gap-1">
              {announcement.status !== 'published' ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Post ${announcement.title}`}
                  loading={isPublishing}
                  onClick={() => onPublish?.(announcement.id)}
                >
                  <Send className="size-3.5" aria-hidden />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${announcement.title}`}
                onClick={() => onEdit?.(announcement)}
              >
                <Pencil className="size-3.5" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${announcement.title}`}
                onClick={() => onDelete?.(announcement)}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
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
