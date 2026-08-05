import { Outlet } from 'react-router-dom';

import { AppLogo } from '@/shared/components/app-logo';
import { ThemeToggle } from '@/shared/components/theme-toggle';

/**
 * The signed-out shell.
 *
 * Split layout on desktop — form on the left, brand panel on the right —
 * collapsing to the form alone below `lg`, where the decorative half would
 * only push the inputs off the fold.
 */
export default function AuthLayout() {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.05fr_0.95fr]">
      {/* ── Form ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-center border-border bg-card px-6 py-12 sm:px-12 lg:border-r lg:px-20">
        <div className="mb-12 flex items-center gap-3">
          <AppLogo size={44} className="rounded-xl" />
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-extrabold tracking-tight text-ink">GNASchools</span>
            <span className="text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
              Learning Management System
            </span>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <main className="flex flex-1 flex-col justify-center">
          <Outlet />
        </main>

        <footer className="mt-12 text-[12px] text-ink-3">
          © {new Date().getFullYear()} Great Nigeria Academy. All rights reserved.
        </footer>
      </div>

      {/* ── Brand panel ──────────────────────────────────────────────── */}
      <aside
        aria-hidden
        className="relative hidden flex-col justify-center overflow-hidden bg-gradient-to-br from-brand-soft to-background px-20 lg:flex"
      >
        <div
          className="absolute -top-24 -right-24 size-80 rounded-full bg-brand/10 blur-3xl"
          aria-hidden
        />
        <div
          className="absolute -bottom-32 -left-16 size-96 rounded-full bg-info/10 blur-3xl"
          aria-hidden
        />

        <div className="relative">
          <p className="text-[11px] font-extrabold tracking-[0.18em] text-brand uppercase">
            JSS1–SS3
          </p>
          <h2 className="mt-4 text-[40px] leading-[1.1] font-extrabold tracking-tight text-ink">
            One place for lessons, assignments and results.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-2">
            Teachers set the work, students hand it in, parents follow the progress — and the school
            sees the whole picture.
          </p>

          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6">
            {[
              { value: '200+', label: 'Students' },
              { value: '20', label: 'Subjects' },
              { value: '10', label: 'Classes' },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="text-2xl font-extrabold tracking-tight text-ink">{stat.value}</dt>
                <dd className="mt-0.5 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
