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
 * Falls back to the bundled Eryvia mark when a school has not uploaded one, so
 * the shell never renders a broken image. The mark is an SVG so it stays sharp
 * from a 16px favicon to a 44px sign-in lockup without shipping four PNGs.
 */
export function AppLogo({ src, size = 32, className, alt = 'Eryvia' }: AppLogoProps) {
  return (
    <img
      // An empty string is as good as absent here, so `??` is not enough.
      src={src && src.length > 0 ? src : '/brand/eryvia-mark.svg'}
      alt={alt}
      width={size}
      height={size}
      // No border or rounded box: the mark sits directly on the background.
      // `object-contain` rather than `cover` so a crest of any aspect ratio is
      // letterboxed instead of cropped — cropping a school's badge is worse
      // than a little empty space beside it.
      className={cn('shrink-0 object-contain', className)}
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
        {schoolName ?? 'Eryvia'}
      </span>
      {subtitle ? (
        <span className="truncate text-[10.5px] font-semibold tracking-wider text-ink-3 uppercase">
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}
