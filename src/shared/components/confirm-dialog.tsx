import type { ReactNode } from 'react';

import { Button } from './ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Defaults to "Confirm". Name the action — "Archive student", not "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red button and warning framing, for anything that removes or disables. */
  destructive?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
}

/**
 * A single confirmation dialog for every destructive or irreversible action.
 *
 * The confirm button carries the verb rather than "OK", because a dialog that
 * says "Are you sure? [OK]" is read past — one that says "[Archive student]"
 * has to be read to be dismissed.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  isPending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <DialogDescription>{description}</DialogDescription>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            loading={isPending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
