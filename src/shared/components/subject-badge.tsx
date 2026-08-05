import { cn } from '@/shared/utils/cn';

interface SubjectBadgeProps {
  code: string;
  /** Hex from `subjects.color`. Validated by a CHECK constraint, so it is safe to trust. */
  color?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'size-8 text-[10px] rounded-lg',
  md: 'size-11 text-[11px] rounded-xl',
  lg: 'size-14 text-[13px] rounded-2xl',
} as const;

/**
 * The subject code tile — MTH, ENG, CIV — in the subject's own colour.
 *
 * The colour is per-row data, so it arrives as an inline style rather than a
 * Tailwind class; there is no way to generate a class per school-defined hex at
 * build time. `subjects.color` is constrained to `^#[0-9a-fA-F]{6}$` in the
 * schema, which is what makes interpolating it here safe.
 *
 * The background is the same hue at 14% alpha so a tile reads as tinted rather
 * than saturated, and stays legible in both themes.
 */
export function SubjectBadge({ code, color, size = 'md', className }: SubjectBadgeProps) {
  const hex = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#2563eb';

  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center font-extrabold tracking-wide',
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: `${hex}24`, color: hex }}
    >
      {code}
    </span>
  );
}
