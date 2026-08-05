import { Clock, LogOut, RefreshCw } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';

import { useAuth } from '../hooks/use-auth';
import { useSignOut } from '../hooks/use-auth-mutations';

/**
 * The account exists but has no school and no role yet.
 *
 * This happens when someone signs up before an administrator places them —
 * `handle_new_user()` deliberately leaves `school_id` null when it cannot
 * determine the school, and RLS then denies everything. Rather than showing an
 * app full of empty tables, say so plainly.
 */
export default function PendingAccessPage() {
  const { context, refresh } = useAuth();
  const signOut = useSignOut();

  return (
    <div className="w-full max-w-[420px]">
      <span className="mb-6 grid size-12 place-items-center rounded-full bg-warning-soft text-warning">
        <Clock className="size-6" aria-hidden />
      </span>

      <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-ink">
        Waiting for approval
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-ink-2">
        Your account has been created
        {context?.profile.email ? (
          <>
            {' '}
            for <strong className="text-ink">{context.profile.email}</strong>
          </>
        ) : null}
        , but an administrator has not yet added you to a school. Until they do, there is nothing
        for you to see here.
      </p>

      <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
        This usually takes a working day. If it has been longer, contact your school office and
        quote the address above.
      </p>

      <div className="mt-8 flex flex-col gap-2">
        <Button
          onClick={() => {
            void refresh();
          }}
        >
          <RefreshCw className="size-4" aria-hidden />
          Check again
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            signOut.mutate();
          }}
          loading={signOut.isPending}
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </div>
  );
}
