import { useContext } from 'react';

import { AuthContext, type AuthContextValue } from '../contexts/auth-context';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}

/**
 * The signed-in user, asserted non-null.
 *
 * Only safe below a `<RequireAuth>` boundary — which is the only place it is
 * used. Saves every screen inside the app shell from re-checking a value the
 * router has already guaranteed.
 */
export function useCurrentUser() {
  const { context, session } = useAuth();

  if (!context || !session) {
    throw new Error('useCurrentUser must be used inside a <RequireAuth> boundary');
  }

  return {
    session,
    user: context.profile,
    school: context.school,
    currentSession: context.current_session,
    children: context.children,
    roles: context.roles,
    studentId: context.student_id,
    teacherId: context.teacher_id,
    parentId: context.parent_id,
    unreadNotifications: context.unread_notifications,
  };
}
