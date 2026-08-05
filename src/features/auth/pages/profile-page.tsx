import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Separator } from '@/shared/components/ui/separator';
import { ROLE_LABEL } from '@/shared/lib/constants';
import { isAppRole } from '@/shared/types';
import { formatDate } from '@/shared/utils/format';

import { useCurrentUser } from '../hooks/use-auth';

/**
 * Read-only profile.
 *
 * Editing arrives in Phase 2. The guard is already in place either way:
 * `app.protect_user_columns()` silently restores `school_id`, `status`,
 * `email` and `metadata` on any update that is not made by an administrator,
 * so a self-service edit form cannot be turned into a privilege escalation.
 */
export default function ProfilePage() {
  const { user, school, roles, currentSession } = useCurrentUser();

  const fields: { label: string; value: string }[] = [
    { label: 'Full name', value: user.full_name },
    { label: 'Email address', value: user.email },
    { label: 'Phone', value: user.phone ?? '—' },
    { label: 'Date of birth', value: formatDate(user.date_of_birth) },
    { label: 'School', value: school?.name ?? '—' },
    {
      label: 'Current term',
      value: currentSession ? `${currentSession.name} · ${currentSession.term}` : '—',
    },
    { label: 'Timezone', value: user.timezone },
    { label: 'Member since', value: formatDate(user.created_at) },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My profile" description="What the school has on file for you." />

      <Card>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <UserAvatar
              fullName={user.full_name}
              avatarPath={user.avatar_path}
              className="size-14"
            />
            <div className="space-y-1.5">
              <p className="text-base font-extrabold tracking-tight text-ink">{user.full_name}</p>
              <div className="flex flex-wrap gap-1.5">
                {roles.map((role) => (
                  <Badge key={role} variant="brand">
                    {isAppRole(role) ? ROLE_LABEL[role] : role}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label}>
                <dt className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                  {field.label}
                </dt>
                <dd className="mt-1 text-sm font-medium break-words text-ink">{field.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <p className="text-[12.5px] text-ink-3">
        To correct anything on this page, contact your school office.
      </p>
    </div>
  );
}
