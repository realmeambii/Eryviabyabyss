import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/utils/cn';

const alertVariants = cva(
  'relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface-2 text-ink',
        info: 'border-brand-border bg-brand-soft text-brand',
        success: 'border-success/25 bg-success-soft text-success',
        warning: 'border-warning/25 bg-warning-soft text-warning',
        destructive: 'border-danger/25 bg-danger-soft text-danger',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 text-[13px] leading-relaxed opacity-90', className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, alertVariants };
