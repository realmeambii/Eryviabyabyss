import { cn } from '@/shared/utils/cn';

interface AppLogoProps {
  /** Optional school crest from the `school-logos` bucket. */
  src?: string | null;
  size?: number;
  className?: string;
  alt?: string;
}

/**
 * The school crest.
 *
 * Falls back to the bundled GNASchools mark when a school has not uploaded
 * one, so the shell never renders a broken image.
 */
export function AppLogo({ src, size = 32, className, alt = 'GNASchools crest' }: AppLogoProps) {
  return (
    <img
      // An empty string is as good as absent here, so `??` is not enough.
      src={src && src.length > 0 ? src : '/brand/logo.png'}
      alt={alt}
      width={size}
      height={size}
      className={cn('shrink-0 rounded-[9px] border border-border object-cover', className)}
      style={{ width: size, height: size }}
    />
  );
}

interface WordmarkProps {
  schoolName?: string | null;
  subtitle?: string | null;
  className?: string;
}

export function AppWordmark({ schoolName, subtitle, className }: WordmarkProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-px', className)}>
      <span className="truncate text-sm font-extrabold tracking-tight text-ink">
        {schoolName ?? 'GNASchools'}
      </span>
      {subtitle ? (
        <span className="truncate text-[10.5px] font-semibold tracking-wider text-ink-3 uppercase">
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}
