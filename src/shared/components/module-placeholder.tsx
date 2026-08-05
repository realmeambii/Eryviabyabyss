import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';

import { PageHeader } from './page-header';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface ModulePlaceholderProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  /** What Phase 2 will build here. Keeps the scaffold honest about its state. */
  planned: string[];
  /** Which tables and RPCs the module's data layer already talks to. */
  dataLayer?: string[];
}

/**
 * Placeholder for a module whose data layer exists but whose screens are Phase 2.
 *
 * Phase 1 ships the architecture — schema, RLS, typed services, routing — and a
 * shell to test authentication against. Rather than an empty route, each module
 * states what is already wired underneath it and what comes next.
 */
export function ModulePlaceholder({
  title,
  description,
  icon: Icon = Construction,
  planned,
  dataLayer,
}: ModulePlaceholderProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={<Badge variant="warning">Phase 2</Badge>}
      />

      <Card>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-bold text-ink">Coming in the next phase</p>
              <p className="text-[13px] leading-relaxed text-ink-3">
                The database schema, row-level security policies and typed data layer for this
                module are already in place — only the screens are outstanding.
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                Planned
              </p>
              <ul className="space-y-1.5">
                {planned.map((item) => (
                  <li key={item} className="flex gap-2 text-[13px] text-ink-2">
                    <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {dataLayer && dataLayer.length > 0 ? (
              <div>
                <p className="mb-2 text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                  Already wired
                </p>
                <ul className="space-y-1.5">
                  {dataLayer.map((item) => (
                    <li key={item} className="flex gap-2 text-[13px] text-ink-2">
                      <span
                        className="mt-[7px] size-1 shrink-0 rounded-full bg-success"
                        aria-hidden
                      />
                      <code className="text-[12px]">{item}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
