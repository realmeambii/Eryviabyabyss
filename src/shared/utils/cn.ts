import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting later Tailwind utilities win over earlier ones.
 *
 * `clsx` flattens conditionals; `twMerge` resolves conflicts, so
 * `cn('p-2', 'p-4')` is `p-4` rather than both classes fighting on specificity.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
