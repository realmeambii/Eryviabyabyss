import type * as React from 'react';

import { cn } from '@/shared/utils/cn';

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** Breadcrumb trail, rendered above the title. */
  breadcrumbs?: { label: string; to?: string }[];
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-ink-3">
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {index > 0 ? <span aria-hidden>/</span> : null}
                <span className={index === breadcrumbs.length - 1 ? 'text-ink-2' : undefined}>
                  {crumb.label}
                </span>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-ink">
            {title}
          </h1>
          {description ? <p className="max-w-2xl text-sm text-ink-2">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
