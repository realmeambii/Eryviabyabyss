import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Enums } from '@/shared/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Administrators and their capabilities
 * ═══════════════════════════════════════════════════════════════════════════
 *  "Administrator" is not one thing. One grant per school is the founder —
 *  `is_super`, holding everything implicitly, and the only grant that may
 *  create or alter another administrator. Every other administrator holds an
 *  explicit set of capabilities.
 *
 *  Nothing in this file is a security boundary. `app.admin_can()` sits in the
 *  WITH CHECK clause of every administrative write policy and
 *  `user_roles_insert_admin` refuses a sub-administrator who tries to mint a
 *  peer. What is here exists so the interface can stop *offering* actions that
 *  would be refused — a screen full of buttons that all fail is worse than a
 *  screen without them.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CAPABILITIES = [
  'users',
  'academics',
  'timetable',
  'results',
  'announcements',
  'audit',
  'settings',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABEL: Record<Capability, { title: string; description: string }> = {
  users: {
    title: 'People',
    description: 'Create, edit and deactivate pupils, teachers and guardians.',
  },
  academics: {
    title: 'Academics',
    description: 'Classes, subjects, terms, enrolment and who teaches what.',
  },
  timetable: {
    title: 'Timetable',
    description: 'The weekly timetable and the school’s bell schedule.',
  },
  results: {
    title: 'Results',
    description: 'School-wide results, and withdrawing a published mark.',
  },
  announcements: {
    title: 'Announcements',
    description: 'Post announcements to the whole school.',
  },
  audit: {
    title: 'Audit log',
    description: 'Read the record of who changed what.',
  },
  settings: {
    title: 'School settings',
    description: 'The school profile and the grading scale.',
  },
};

type UserStatus = Enums<'user_status'>;

export interface AdministratorRow {
  grant_id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_path: string | null;
  status: UserStatus;
  is_super: boolean;
  capabilities: string[];
  granted_at: string;
}

export async function listAdministrators(): Promise<AdministratorRow[]> {
  const { data, error } = await supabase.rpc('list_administrators');
  if (error) throw toAppError(error);
  return data ?? [];
}

export interface MyCapabilities {
  isAdministrator: boolean;
  isSuper: boolean;
  capabilities: Capability[];
}

/**
 * What the signed-in administrator may do.
 *
 * Returns no row for anybody else, which is the honest answer — a teacher has
 * no administrator capabilities rather than an empty set of them.
 */
export async function getMyCapabilities(): Promise<MyCapabilities> {
  const { data, error } = await supabase.rpc('my_admin_capabilities');
  if (error) throw toAppError(error);

  const row = (data ?? [])[0];
  if (!row) return { isAdministrator: false, isSuper: false, capabilities: [] };

  return {
    isAdministrator: true,
    isSuper: row.is_super,
    capabilities: (row.capabilities ?? []).filter((value): value is Capability =>
      (CAPABILITIES as readonly string[]).includes(value),
    ),
  };
}

/**
 * Turn a capability on or off for one administrator.
 *
 * A plain UPDATE, because the policy already says who may run it: the WITH
 * CHECK on `user_roles_update_admin` requires `app.is_super_admin()` for any
 * row whose role is administrator. A non-founder gets zero rows back rather
 * than an error, which the hook reports rather than swallowing.
 */
export async function setCapabilities(
  grantId: string,
  capabilities: Capability[],
): Promise<AdministratorRow | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .update({ capabilities })
    .eq('id', grantId)
    .select('id')
    .maybeSingle();

  if (error) throw toAppError(error);
  // Null means the policy matched nothing — the caller is not the founder.
  return data ? ({ grant_id: data.id } as AdministratorRow) : null;
}

/**
 * Take the administrator role away entirely.
 *
 * Deletes the grant, not the account. The person stays a member of the school
 * — very often a teacher — and their work, their marks and their messages are
 * untouched. Deactivating the *account* is a separate action, and a heavier one.
 */
export async function revokeAdministrator(grantId: string): Promise<void> {
  const { error } = await supabase.from('user_roles').delete().eq('id', grantId);
  if (error) throw toAppError(error);
}
