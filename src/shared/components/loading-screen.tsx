import { Loader2 } from 'lucide-react';

import { AppLogo } from './app-logo';

/**
 * Full-page loader.
 *
 * Shown while the session is being restored and while a lazily-loaded route
 * chunk is in flight. Deliberately quiet — it appears for a few hundred
 * milliseconds and a spinner that draws attention to itself makes the app feel
 * slower, not faster.
 */
export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background"
    >
      <AppLogo size={44} className="rounded-xl" />
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {label}
      </div>
    </div>
  );
}

/** Inline variant for a panel that is still loading inside a rendered page. */
export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 py-14 text-[13px] font-medium text-ink-3"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
