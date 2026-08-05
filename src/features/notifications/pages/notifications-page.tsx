import { BellRing, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/shared/components/empty-state';
import { LoadingBlock } from '@/shared/components/loading-screen';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { formatRelative } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../hooks/use-notifications';

export default function NotificationsPage() {
  const { data: notifications, isPending } = useNotifications({ limit: 100 });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unread = notifications?.filter((notification) => !notification.is_read).length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : 'Everything here has been read.'}
        actions={
          unread > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              loading={markAll.isPending}
              onClick={() => {
                markAll.mutate();
              }}
            >
              <CheckCheck className="size-4" aria-hidden />
              Mark all read
            </Button>
          ) : null
        }
      />

      {isPending ? <LoadingBlock /> : null}

      {!isPending && (!notifications || notifications.length === 0) ? (
        <EmptyState
          icon={BellRing}
          title="Nothing yet"
          description="New assignments, results and school notices will appear here."
        />
      ) : null}

      {notifications && notifications.length > 0 ? (
        <Card className="divide-y divide-border overflow-hidden p-0">
          {notifications.map((notification) => {
            const body = (
              <div className="flex gap-3">
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    notification.is_read ? 'bg-transparent' : 'bg-brand',
                  )}
                  aria-hidden
                />
                <div className="min-w-0 space-y-1">
                  <p
                    className={cn(
                      'text-[13.5px] leading-snug',
                      notification.is_read ? 'font-medium text-ink-2' : 'font-semibold text-ink',
                    )}
                  >
                    {notification.title}
                  </p>
                  {notification.body ? (
                    <p className="text-[12.5px] leading-relaxed text-ink-3">{notification.body}</p>
                  ) : null}
                  <p className="text-[11.5px] text-ink-3">
                    {formatRelative(notification.created_at)}
                  </p>
                </div>
              </div>
            );

            return (
              <div
                key={notification.id}
                className={cn(
                  'px-4 py-3.5 transition-colors',
                  notification.is_read ? '' : 'bg-brand-soft/50',
                )}
              >
                {notification.action_url ? (
                  <Link
                    to={notification.action_url}
                    onClick={() => {
                      if (!notification.is_read) markRead.mutate({ id: notification.id });
                    }}
                    className="block"
                  >
                    {body}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => {
                      markRead.mutate({ id: notification.id, isRead: !notification.is_read });
                    }}
                  >
                    {body}
                  </button>
                )}
              </div>
            );
          })}
        </Card>
      ) : null}
    </div>
  );
}
