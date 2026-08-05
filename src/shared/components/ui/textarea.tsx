import * as React from 'react';

import { cn } from '@/shared/utils/cn';

function Textarea({ className, rows = 4, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(
        'w-full rounded-lg border border-input bg-surface-2 px-3 py-2.5 text-sm text-ink transition-colors placeholder:text-ink-3',
        'hover:border-border-strong',
        'focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
