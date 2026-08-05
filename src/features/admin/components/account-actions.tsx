import { useState } from 'react';
import { KeyRound, Mail, MoreHorizontal, ShieldOff, ShieldCheck } from 'lucide-react';

import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import type { UserStatus } from '@/shared/types';

import { useUserProvisioning } from '../hooks/use-admin-users';
import { CredentialDialog } from './credential-dialog';

/**
 * The lifecycle menu that hangs off every row in the three registers.
 *
 * Both actions here are service-role operations behind `admin-users`: setting
 * someone else's password and ending their sessions are GoTrue admin calls, and
 * neither can be expressed as a row a browser is allowed to write.
 *
 * Shared rather than reimplemented per register because the wording is the part
 * that matters — "deactivate" has to say what actually happens to the person's
 * session, and that sentence should not exist in three versions.
 */

interface AccountActionsProps {
  userId: string;
  fullName: string;
  email: string;
  status: UserStatus;
}

export function AccountActions({ userId, fullName, email, status }: AccountActionsProps) {
  const { resetPassword, setStatus } = useUserProvisioning();

  const [resetting, setResetting] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);

  const isSuspended = status === 'suspended';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${fullName}`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setResetting(true);
            }}
          >
            <KeyRound aria-hidden />
            Reset password
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant={isSuspended ? 'default' : 'destructive'}
            onSelect={() => {
              setChangingStatus(true);
            }}
          >
            {isSuspended ? <ShieldCheck aria-hidden /> : <ShieldOff aria-hidden />}
            {isSuspended ? 'Reactivate account' : 'Deactivate account'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResetPasswordDialog
        open={resetting}
        onOpenChange={setResetting}
        fullName={fullName}
        email={email}
        isPending={resetPassword.isPending}
        onChoose={(mode) => {
          resetPassword.mutate(
            { userId, mode },
            {
              onSuccess: (result) => {
                setResetting(false);
                if (result.temporaryPassword) setIssued(result.temporaryPassword);
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={changingStatus}
        onOpenChange={setChangingStatus}
        title={isSuspended ? `Reactivate ${fullName}?` : `Deactivate ${fullName}?`}
        description={
          isSuspended ? (
            <>
              They will be able to sign in again with their existing password, and their record
              returns to the active lists.
            </>
          ) : (
            <>
              They are signed out and cannot sign back in. Nothing is deleted — their marks and
              submissions stay exactly as they are, and you can reactivate the account at any time.
            </>
          )
        }
        confirmLabel={isSuspended ? 'Reactivate account' : 'Deactivate account'}
        destructive={!isSuspended}
        isPending={setStatus.isPending}
        onConfirm={() => {
          setStatus.mutate(
            { userId, status: isSuspended ? 'active' : 'suspended' },
            {
              onSuccess: () => {
                setChangingStatus(false);
              },
            },
          );
        }}
      />

      <CredentialDialog
        open={issued !== null}
        onOpenChange={(next) => {
          if (!next) setIssued(null);
        }}
        title="Temporary password issued"
        description={`Give this to ${fullName}. Their old password no longer works.`}
        fullName={fullName}
        email={email}
        password={issued ?? ''}
      />
    </>
  );
}

// ── Reset ───────────────────────────────────────────────────────────────────

/**
 * Two routes to the same outcome, and the choice is not cosmetic.
 *
 * The emailed link never shows the administrator a credential, which is the
 * better default — but it assumes the person has a mailbox they can reach, and
 * for most pupils at a Nigerian secondary school that is not true. So the
 * offline route is offered as a peer, not buried.
 */
function ResetPasswordDialog({
  open,
  onOpenChange,
  fullName,
  email,
  isPending,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullName: string;
  email: string;
  isPending: boolean;
  onChoose: (mode: 'email' | 'temporary') => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset {fullName}&rsquo;s password</DialogTitle>
          <DialogDescription>
            Either way their current password stops working the moment the new one is set.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              onChoose('email');
            }}
            className="flex w-full cursor-pointer items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50"
          >
            <Mail className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">Email them a link</span>
              <span className="block text-[12.5px] text-ink-3">
                A single-use link goes to {email}. You never see the password.
              </span>
            </span>
          </button>

          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              onChoose('temporary');
            }}
            className="flex w-full cursor-pointer items-start gap-3 rounded-xl border border-border p-4 text-left transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50"
          >
            <KeyRound className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">
                Issue a temporary password
              </span>
              <span className="block text-[12.5px] text-ink-3">
                Shown to you once, to hand over in person. For anyone without an inbox.
              </span>
            </span>
          </button>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="secondary"
            disabled={isPending}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
