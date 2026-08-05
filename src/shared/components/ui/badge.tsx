import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/utils/cn';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold whitespace-nowrap [&>svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'bg-surface-3 text-ink-2',
        brand: 'bg-brand-soft text-brand',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        info: 'bg-info-soft text-info',
        outline: 'border border-border text-ink-2',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
