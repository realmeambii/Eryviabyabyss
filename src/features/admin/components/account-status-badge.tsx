import { Badge } from '@/shared/components/ui/badge';
import type { UserStatus } from '@/shared/types';

const ACCOUNT_STATUS: Record<
  UserStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  active: { label: 'Active', variant: 'success' },
  // The account exists but its address has never been confirmed. Only reachable
  // through self-signup — provisioned accounts land straight on `active`.
  invited: { label: 'Invited', variant: 'warning' },
  suspended: { label: 'Deactivated', variant: 'danger' },
  archived: { label: 'Archived', variant: 'neutral' },
};

/**
 * Whether the login works. Deliberately not the same badge as a student's
 * enrolment status or a teacher's `is_active` flag — conflating "cannot sign
 * in" with "has left the school" is how someone ends up locked out for a term.
 *
 * An unrecognised value renders as "Unknown" rather than throwing, and the
 * parameter accepts null. That is not defensive padding: `user_status` is a
 * Postgres enum, `alter type … add value` is a one-line migration, and the
 * browser bundle is deployed separately from the database. A client that
 * predates a new value — or postdates a column it expects and the database has
 * not got yet — will be handed something this map has never heard of. A muted
 * badge in one table cell is the correct blast radius for that; taking down
 * every screen the badge appears on is not.
 */
export function AccountStatusBadge({ status }: { status: UserStatus | null | undefined }) {
  const known = status ? ACCOUNT_STATUS[status] : undefined;

  if (!known) return <Badge variant="neutral">Unknown</Badge>;

  return <Badge variant={known.variant}>{known.label}</Badge>;
}
