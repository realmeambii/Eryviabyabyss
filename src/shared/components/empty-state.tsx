import type * as React from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';

import { cn } from '@/shared/utils/cn';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center',
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-3">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-bold text-ink">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-ink-3">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
