import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

import { Card } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/utils/cn';
import { formatNumber } from '@/shared/utils/format';

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: number | string | null | undefined;
  /** Small print under the number — units, or what the count is of. */
  hint?: string;
  /** Makes the whole tile a link. */
  to?: string;
  isLoading?: boolean;
  /** Draws attention when the number is work waiting to be done. */
  tone?: 'default' | 'attention';
}

/**
 * One number, named.
 *
 * Separate from `ShortcutGrid` rather than an option on it: a shortcut is a
 * door, a tile is a reading. Conflating them produced dashboards where the
 * count and the navigation fought for the same visual weight.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  to,
  isLoading = false,
  tone = 'default',
}: StatTileProps) {
  const attention = tone === 'attention' && typeof value === 'number' && value > 0;

  const body = (
    <Card
      className={cn(
        'h-full p-4 transition-colors',
        to && 'group hover:border-brand-border',
        attention && 'border-warning/30 bg-warning-soft/30',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl',
            attention ? 'bg-warning-soft text-warning' : 'bg-brand-soft text-brand',
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>

        <div className="min-w-0 space-y-0.5">
          <p className="text-[11.5px] font-bold tracking-wide text-ink-3 uppercase">{label}</p>

          {isLoading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <p className="text-[26px] leading-none font-extrabold tracking-tight text-ink">
              {typeof value === 'number' ? formatNumber(value) : (value ?? '—')}
            </p>
          )}

          {hint ? <p className="pt-1 text-[12px] text-ink-3">{hint}</p> : null}
        </div>
      </div>
    </Card>
  );

  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
