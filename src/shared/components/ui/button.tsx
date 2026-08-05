import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/shared/utils/cn';

const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap',
    'cursor-pointer rounded-lg text-sm font-semibold transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand text-primary-foreground hover:bg-brand-hover',
        secondary: 'border border-border bg-surface text-ink hover:bg-surface-2',
        ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        soft: 'border border-brand-border bg-brand-soft text-brand hover:bg-brand-soft/70',
        destructive: 'bg-danger text-white hover:bg-danger/90',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-9.5 px-4',
        lg: 'h-11 px-6 text-[15px]',
        icon: 'size-9 p-0',
        'icon-sm': 'size-8 p-0',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render as the child element (a `<Link>`, say) instead of a `<button>`. */
  asChild?: boolean;
  /** Swaps in a spinner and disables the button. */
  loading?: boolean;
}

function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, block, className }))}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
