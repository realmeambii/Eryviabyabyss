import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardContent } from './ui/card';

/**
 * Note: `greeting()` deliberately lives in `shared/utils/format` rather than
 * here — a file that exports both components and plain functions breaks Fast
 * Refresh, which remounts the tree and drops state on every edit.
 */
export interface Shortcut {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

/** The card grid every portal dashboard opens with. */
export function ShortcutGrid({ shortcuts }: { shortcuts: Shortcut[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {shortcuts.map((shortcut) => {
        const Icon = shortcut.icon;
        return (
          <Link key={shortcut.to} to={shortcut.to} className="group">
            <Card className="h-full transition-colors hover:border-brand-border">
              <CardContent className="flex items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-ink transition-colors group-hover:text-brand">
                    {shortcut.title}
                  </p>
                  <p className="text-[13px] leading-relaxed text-ink-3">{shortcut.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
