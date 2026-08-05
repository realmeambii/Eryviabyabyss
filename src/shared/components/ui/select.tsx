import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/shared/utils/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<React.ComponentProps<'select'>, 'children'> {
  options: SelectOption[];
  /** Rendered as a disabled first option, so "nothing chosen" is visible. */
  placeholder?: string;
}

/**
 * A native `<select>`, styled to the design system.
 *
 * Deliberately not a Radix listbox. On a phone the native control opens the
 * platform picker — a wheel on iOS, a full-screen list on Android — which is
 * faster to use and more accessible than anything reimplemented in a div. The
 * school runs on whatever hardware families own, so that matters more here than
 * pixel-identical menus across platforms.
 *
 * The trade-off is that option rows cannot be styled. Nothing in this product
 * needs them to be.
 */
function Select({ className, options, placeholder, value, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        value={value ?? ''}
        className={cn(
          'h-9.5 w-full appearance-none rounded-lg border border-input bg-surface-2 py-1 pr-9 pl-3 text-sm text-ink transition-colors',
          'hover:border-border-strong',
          'focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-danger',
          // The placeholder option should read as muted, like an input's.
          value === '' || value === undefined ? 'text-ink-3' : '',
          className,
        )}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3"
        aria-hidden
      />
    </div>
  );
}

export { Select };
