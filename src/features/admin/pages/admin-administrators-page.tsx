import { useState } from 'react';
import { Crown, ShieldCheck, ShieldOff, UserPlus } from 'lucide-react';

import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/utils/cn';

import {
  CAPABILITIES,
  CAPABILITY_LABEL,
  type AdministratorRow,
  type Capability,
} from '../api/administrators.service';
import { AccountStatusBadge } from '../components/account-status-badge';
import { NewUserDialog } from '../components/new-user-dialog';
import {
  useAdministrators,
  useAdministratorMutations,
  useMyCapabilities,
} from '../hooks/use-administrators';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Administrators
 * ═══════════════════════════════════════════════════════════════════════════
 *  "Administrator" used to be one thing, and it meant everything. A school that
 *  wanted an exams officer who publishes results, or a registrar who enrols
 *  pupils and touches nothing else, had to hand over the whole school.
 *
 *  Now one grant per school is the founder — the first administrator, marked
 *  with a crown — and everyone else holds an explicit set of capabilities that
 *  only the founder can change. That last rule is the one the scheme rests on:
 *  a sub-administrator who could edit these toggles would simply tick them all.
 *
 *  Every toggle here mirrors a predicate in the database. Turning one off does
 *  not hide a button and hope; it stops the write at `app.admin_can()`, which
 *  sits in the WITH CHECK clause of the policy. The interface follows the rule
 *  rather than being it.
 *
 *  Reads are deliberately untouched by any of this. An exams officer who cannot
 *  see the class list cannot do their job, so what a capability withdraws is
 *  always the ability to *change* something.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function AdminAdministratorsPage() {
  const mine = useMyCapabilities();
  const administrators = useAdministrators();
  const { setCapabilities, revoke } = useAdministratorMutations();

  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<AdministratorRow | null>(null);

  const isSuper = mine.data?.isSuper ?? false;
  const rows = administrators.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administrators"
        description="Who runs the school in this system, and exactly what each of them may change."
        actions={
          isSuper ? (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <UserPlus className="size-4" aria-hidden />
              Add administrator
            </Button>
          ) : null
        }
      />

      {mine.isPending ? null : isSuper ? (
        <Alert>
          <AlertDescription>
            You are the founding administrator. You are the only person who can add another
            administrator or change what one may do, and your own access cannot be removed from
            inside the app.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertDescription>
            You can see who else administers the school, but only the founding administrator can
            change these permissions.
          </AlertDescription>
        </Alert>
      )}

      {administrators.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No administrators"
          description="Nobody administers this school yet."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.grant_id}>
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar
                        fullName={row.full_name}
                        avatarPath={row.avatar_path}
                        className="size-10"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-bold text-ink">{row.full_name}</p>
                          {row.is_super ? (
                            <Badge variant="brand">
                              <Crown className="size-3" aria-hidden />
                              Founder
                            </Badge>
                          ) : null}
                          <AccountStatusBadge status={row.status} />
                        </div>
                        <p className="truncate text-[12.5px] text-ink-3">{row.email}</p>
                      </div>
                    </div>

                    {isSuper && !row.is_super ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => {
                          setRevoking(row);
                        }}
                      >
                        <ShieldOff className="size-3.5" aria-hidden />
                        Remove access
                      </Button>
                    ) : null}
                  </div>

                  {row.is_super ? (
                    <p className="text-[12.5px] text-ink-3">
                      Holds every permission, always. The founding grant cannot be narrowed or
                      removed — a school with no founder could never appoint one again.
                    </p>
                  ) : (
                    <CapabilityToggles
                      row={row}
                      editable={isSuper}
                      saving={setCapabilities.isPending}
                      onChange={(capabilities) => {
                        setCapabilities.mutate({ grantId: row.grant_id, capabilities });
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* The dialog handles the provisioning; the Edge Function refuses an
          administrator role from anyone but the founder, so this is an
          affordance and not a gate. */}
      <NewUserDialog open={creating} onOpenChange={setCreating} role="administrator" />

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(next) => {
          if (!next) setRevoking(null);
        }}
        title="Remove administrator access?"
        description={
          revoking
            ? `${revoking.full_name} will no longer administer the school. Their account stays open and any other role they hold — teaching, for instance — is untouched.`
            : ''
        }
        confirmLabel="Remove access"
        destructive
        isPending={revoke.isPending}
        onConfirm={() => {
          if (revoking) {
            revoke.mutate(revoking.grant_id, {
              onSuccess: () => {
                setRevoking(null);
              },
            });
          }
        }}
      />
    </div>
  );
}

// ── Toggles ─────────────────────────────────────────────────────────────────

function CapabilityToggles({
  row,
  editable,
  saving,
  onChange,
}: {
  row: AdministratorRow;
  editable: boolean;
  saving: boolean;
  onChange: (capabilities: Capability[]) => void;
}) {
  const held = new Set(row.capabilities);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CAPABILITIES.map((capability) => {
        const on = held.has(capability);
        const meta = CAPABILITY_LABEL[capability];

        return (
          <label
            key={capability}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors',
              on ? 'border-brand-border bg-brand-soft/40' : 'border-border bg-surface-2',
              editable ? 'cursor-pointer' : 'cursor-default opacity-80',
            )}
          >
            <input
              type="checkbox"
              checked={on}
              disabled={!editable || saving}
              onChange={(event) => {
                const next = new Set(held);
                if (event.target.checked) next.add(capability);
                else next.delete(capability);
                onChange([...next] as Capability[]);
              }}
              className="mt-0.5 size-4 shrink-0 rounded border-border"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-ink">{meta.title}</span>
              <span className="block text-[11.5px] text-ink-3">{meta.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
