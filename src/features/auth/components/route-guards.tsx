import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { LoadingScreen } from '@/shared/components/loading-screen';
import { ROLE_HOME, ROUTES } from '@/shared/lib/constants';
import type { AppRoleOrCustom } from '@/shared/types';

import { useAuth } from '../hooks/use-auth';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Route guards
 * ═══════════════════════════════════════════════════════════════════════════
 *  These decide what to *render*. They are not a security boundary — anyone
 *  can edit the bundle and remove them. The security boundary is RLS: a
 *  student who forces their way to /admin gets an empty table, because the
 *  policies never return the rows.
 *
 *  What the guards buy is a coherent experience: no half-rendered screens
 *  during the session restore, no 403-shaped empty states where a redirect is
 *  the right answer, and the page the user asked for preserved across a login.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface GuardProps {
  children?: ReactNode;
}

/** Signed in, placed in a school, and holding at least one role. */
export function RequireAuth({ children }: GuardProps) {
  const { isAuthenticated, isLoading, isPending } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen label="Checking your session…" />;

  if (!isAuthenticated) {
    // `state.from` is what sends the user back where they were headed once
    // they have signed in.
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }

  if (isPending) return <Navigate to={ROUTES.onboarding} replace />;

  return children ? <>{children}</> : <Outlet />;
}

interface RequireRoleProps extends GuardProps {
  roles: AppRoleOrCustom[];
  /** Where to send an authenticated user who lacks the role. */
  fallback?: string;
}

/** Narrows a branch of the tree to specific roles. */
export function RequireRole({ roles, fallback, children }: RequireRoleProps) {
  const { isLoading, isAuthenticated, hasRole, primaryRole } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen label="Checking your access…" />;

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }

  if (!hasRole(...roles)) {
    // Send them to their own portal rather than a dead end, unless they have
    // no portal at all — then the 403 page explains why.
    const home = fallback ?? (primaryRole ? ROLE_HOME[primaryRole] : ROUTES.forbidden);
    return <Navigate to={home} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

/** Keeps a signed-in user off the login and password-reset screens. */
export function RedirectIfAuthenticated({ children }: GuardProps) {
  const { isAuthenticated, isLoading, isPending, primaryRole } = useAuth();

  if (isLoading) return <LoadingScreen />;

  if (isAuthenticated) {
    if (isPending) return <Navigate to={ROUTES.onboarding} replace />;
    return <Navigate to={primaryRole ? ROLE_HOME[primaryRole] : ROUTES.root} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

/** Sends `/` to whichever portal the user's role belongs to. */
export function RoleHomeRedirect() {
  const { isLoading, isAuthenticated, isPending, primaryRole } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to={ROUTES.login} replace />;
  if (isPending) return <Navigate to={ROUTES.onboarding} replace />;
  if (!primaryRole) return <Navigate to={ROUTES.forbidden} replace />;

  return <Navigate to={ROLE_HOME[primaryRole]} replace />;
}
