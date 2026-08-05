import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useAuth, useCurrentUser } from '@/features/auth';
import { useUnreadNotificationCount } from '@/features/notifications';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { LoadingBlock } from '@/shared/components/loading-screen';
import { useIsMobile } from '@/shared/hooks/use-media-query';
import type { AppRole } from '@/shared/types';
import { cn } from '@/shared/utils/cn';

import { AppSidebar } from './components/app-sidebar';
import { AppTopbar } from './components/app-topbar';

const SIDEBAR_STORAGE_KEY = 'gnaschools.sidebar-open';

/**
 * The signed-in shell: sidebar, topbar, page.
 *
 * Rendered below `<RequireAuth>`, so `useCurrentUser()` is safe here.
 *
 * On desktop the sidebar collapses to an icon rail and the choice is
 * remembered. On mobile it is an overlay drawer that closes on navigation —
 * one component, two behaviours, chosen by a media query rather than by
 * duplicating the markup.
 */
export default function AppLayout() {
  const { primaryRole } = useAuth();
  const { school } = useCurrentUser();
  const isMobile = useIsMobile();
  const location = useLocation();

  const [desktopOpen, setDesktopOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const unreadCount = useUnreadNotificationCount();
  const role: AppRole = primaryRole ?? 'student';

  const toggleDesktop = () => {
    setDesktopOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // Preference is lost on reload; harmless.
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-dvh bg-background">
      {/* ── Desktop rail ─────────────────────────────────────────────── */}
      <div className="sticky top-0 hidden h-dvh md:block">
        <AppSidebar
          role={role}
          schoolName={school?.name}
          schoolLogoPath={school?.logo_path}
          unreadCount={unreadCount}
          open={desktopOpen}
          onToggle={toggleDesktop}
        />
      </div>

      {/* ── Mobile drawer ────────────────────────────────────────────── */}
      {isMobile ? (
        <>
          <div
            role="presentation"
            onClick={() => {
              setDrawerOpen(false);
            }}
            className={cn(
              'fixed inset-0 z-40 bg-ink/40 transition-opacity md:hidden',
              drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          />
          <div
            className={cn(
              'fixed inset-y-0 left-0 z-50 transition-transform md:hidden',
              drawerOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <AppSidebar
              role={role}
              schoolName={school?.name}
              schoolLogoPath={school?.logo_path}
              unreadCount={unreadCount}
              open
              onToggle={() => {
                setDrawerOpen(false);
              }}
              onNavigate={() => {
                setDrawerOpen(false);
              }}
            />
          </div>
        </>
      ) : null}

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          role={role}
          unreadCount={unreadCount}
          onOpenSidebar={() => {
            setDrawerOpen(true);
          }}
        />

        <main className="flex-1 px-4 pt-6 pb-16 sm:px-7">
          <ErrorBoundary>
            <Suspense fallback={<LoadingBlock />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
