import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';

import { ROLE_PRECEDENCE } from '@/shared/lib/constants';
import { queryKeys } from '@/shared/lib/query-keys';
import { isAppRole, type AppRole, type AppRoleOrCustom } from '@/shared/types';

import * as authService from '../api/auth.service';
import { AuthContext, type AuthContextValue } from '../contexts/auth-context';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AuthProvider — session and identity for the whole app.
 * ═══════════════════════════════════════════════════════════════════════════
 *  Two pieces of state, deliberately separated:
 *
 *    session   who Supabase says you are. Owned by `onAuthStateChange`.
 *    context   what the *database* says you are — roles, school, role ids.
 *              A TanStack query keyed on the user, so it caches, refetches
 *              and invalidates like any other server state.
 *
 *  Roles are never read from the JWT. A token minted before an administrator
 *  changed someone's role would still carry the old one for up to an hour;
 *  `current_user_context()` reads the live tables. The client-side role checks
 *  are for *navigation* — RLS is what actually enforces access.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const [session, setSession] = React.useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = React.useState(true);

  // ── Session ─────────────────────────────────────────────────────────────
  React.useEffect(() => {
    let active = true;

    void authService
      .getSession()
      .then((restored) => {
        if (active) setSession(restored);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setIsRestoring(false);
      });

    const unsubscribe = authService.onAuthStateChange((next, event) => {
      setSession(next);

      // A sign-out or a user switch must not leave another account's rows in
      // the cache — every query in this app is scoped by RLS to whoever asked.
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryClient]);

  // ── Context ─────────────────────────────────────────────────────────────
  const userId = session?.user.id ?? null;

  const contextQuery = useQuery({
    queryKey: [...queryKeys.auth.context(), userId],
    queryFn: authService.fetchUserContext,
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const context = userId ? (contextQuery.data ?? null) : null;

  // ── Derived identity ────────────────────────────────────────────────────
  const roles: AppRoleOrCustom[] = React.useMemo(() => context?.roles ?? [], [context]);

  const primaryRole: AppRole | null = React.useMemo(() => {
    for (const candidate of ROLE_PRECEDENCE) {
      if (roles.includes(candidate)) return candidate;
    }
    // A school's own custom role has no portal of its own yet; treat the
    // holder as a plain member until Phase 2 adds one.
    const firstKnown = roles.find((role) => isAppRole(role));
    return firstKnown && isAppRole(firstKnown) ? firstKnown : null;
  }, [roles]);

  const hasRole = React.useCallback(
    (...candidates: AppRoleOrCustom[]) => candidates.some((role) => roles.includes(role)),
    [roles],
  );

  const refresh = React.useCallback(async () => {
    await contextQuery.refetch();
  }, [contextQuery]);

  const signOut = React.useCallback(async () => {
    await authService.signOut();
    queryClient.clear();
    setSession(null);
  }, [queryClient]);

  const isAuthenticated = Boolean(session);
  // Still resolving *who* they are — treat as loading so guards do not bounce
  // a valid user to the login screen mid-restore.
  const isLoading = isRestoring || (Boolean(userId) && contextQuery.isPending);

  const value: AuthContextValue = React.useMemo(
    () => ({
      session,
      context,
      isLoading,
      isAuthenticated,
      isPending: isAuthenticated && !isLoading && (roles.length === 0 || !context?.school),
      roles,
      primaryRole,
      hasRole,
      isAdministrator: roles.includes('administrator'),
      isTeacher: roles.includes('teacher'),
      isStudent: roles.includes('student'),
      isParent: roles.includes('parent'),
      studentId: context?.student_id ?? null,
      teacherId: context?.teacher_id ?? null,
      parentId: context?.parent_id ?? null,
      schoolId: context?.school?.id ?? null,
      refresh,
      signOut,
    }),
    [session, context, isLoading, isAuthenticated, roles, primaryRole, hasRole, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
