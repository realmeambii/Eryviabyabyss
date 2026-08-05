import * as React from 'react';

import { cn } from '@/shared/utils/cn';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-card',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 px-5 pt-5', className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      data-slot="card-title"
      className={cn('text-[15px] leading-tight font-bold tracking-tight text-ink', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-[13px] leading-relaxed text-ink-3', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('ml-auto flex items-center gap-2', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-5 py-5', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 border-t border-border px-5 py-4', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter };
