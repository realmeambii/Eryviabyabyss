import * as React from 'react';

import { cn } from '@/shared/utils/cn';

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9.5 w-full rounded-lg border border-input bg-surface-2 px-3 py-1 text-sm text-ink transition-colors placeholder:text-ink-3',
        'file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink',
        'hover:border-border-strong',
        'focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger aria-invalid:focus-visible:outline-danger/30',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
