import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
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

interface CredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Who the credential belongs to — shown so it cannot be handed to the wrong person. */
  fullName: string;
  email: string;
  password: string;
  /** Extra context, e.g. what happens to the account next. */
  description?: string;
}

/**
 * The one-time credential hand-off.
 *
 * GoTrue stores a hash, so this password exists in exactly one place: this
 * dialog, until it is dismissed. Everything about the component leans on that —
 * the warning is not decoration, the copy button copies both the address and
 * the password so a half-copied credential cannot be pasted into a message, and
 * the dialog is deliberately dismissed by a button that says the administrator
 * is finished rather than by a stray click on the overlay.
 *
 * It is shown rather than emailed on purpose. A Nigerian secondary school hands
 * a first password to a fourteen-year-old across a desk; most of them have no
 * mailbox of their own, and mail is not a confidential channel in any case.
 */
export function CredentialDialog({
  open,
  onOpenChange,
  title,
  fullName,
  email,
  password,
  description,
}: CredentialDialogProps) {
  const [copied, setCopied] = useState(false);

  // Reset between two different hand-offs, so the second one does not open
  // already showing "Copied".
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copy = () => {
    void navigator.clipboard
      .writeText(`Email: ${email}\nTemporary password: ${password}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2500);
      });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing is fine; opening is driven by the parent's state.
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent
        className="max-w-md"
        // A click on the backdrop is the easiest way to lose a credential that
        // cannot be recovered, so it does not close this one.
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? `Give these details to ${fullName}. They can change it once signed in.`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Alert variant="warning">
            <TriangleAlert aria-hidden />
            <AlertTitle>Shown once</AlertTitle>
            <AlertDescription>
              This password is not stored anywhere it can be read back. Once you close this dialog
              the only way to recover the account is another reset.
            </AlertDescription>
          </Alert>

          <dl className="divide-y divide-border rounded-xl border border-border">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-[12.5px] font-semibold text-ink-3">Name</dt>
              <dd className="truncate text-[13.5px] font-semibold text-ink">{fullName}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-[12.5px] font-semibold text-ink-3">Email</dt>
              <dd className="truncate font-mono text-[13px] text-ink-2">{email}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-3">
                <KeyRound className="size-3.5" aria-hidden />
                Password
              </dt>
              <dd className="font-mono text-[15px] font-bold tracking-wide text-ink select-all">
                {password}
              </dd>
            </div>
          </dl>

          <Button variant="secondary" block onClick={copy}>
            {copied ? (
              <>
                <Check className="size-4" aria-hidden />
                Copied to clipboard
              </>
            ) : (
              <>
                <Copy className="size-4" aria-hidden />
                Copy sign-in details
              </>
            )}
          </Button>
        </DialogBody>

        <DialogFooter>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            I have saved these details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
