import * as React from 'react';

import { cn } from '@/shared/utils/cn';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('animate-pulse rounded-md bg-surface-2', className)}
      {...props}
    />
  );
}

export { Skeleton };
