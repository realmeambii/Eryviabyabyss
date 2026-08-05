import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';

import type { AppRole, AppRoleOrCustom, UserContext } from '@/shared/types';

export interface AuthContextValue {
  /** Supabase session. Null when signed out. */
  session: Session | null;
  /** Profile, roles, school and role ids. Null until loaded, or when signed out. */
  context: UserContext | null;

  /** True while the initial session restore or the context query is in flight. */
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * Signed in, but no school and no role yet — an account an administrator has
   * not placed. Routed to the "pending access" screen.
   */
  isPending: boolean;

  roles: AppRoleOrCustom[];
  /** Highest-precedence role, used to pick the landing portal. */
  primaryRole: AppRole | null;

  hasRole: (...roles: AppRoleOrCustom[]) => boolean;
  isAdministrator: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  isParent: boolean;

  studentId: string | null;
  teacherId: string | null;
  parentId: string | null;
  schoolId: string | null;

  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
