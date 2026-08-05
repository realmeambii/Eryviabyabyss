import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { ROUTES } from '@/shared/lib/constants';

/**
 * Shown when a signed-in user reaches a route their role does not cover.
 *
 * Worth being precise about what this is: a courtesy, not a lock. The lock is
 * row-level security — forcing your way past this screen gets you an empty
 * page, because the policies never return the rows.
 */
export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-warning-soft text-warning">
        <Lock className="size-6" aria-hidden />
      </span>
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold tracking-widest text-ink-3 uppercase">Error 403</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          You do not have access to this
        </h1>
        <p className="mx-auto max-w-sm text-sm text-ink-2">
          Your account does not carry the role this page needs. If that looks wrong, ask your school
          administrator to check your permissions.
        </p>
      </div>
      <Button asChild>
        <Link to={ROUTES.root}>Back to my dashboard</Link>
      </Button>
    </div>
  );
}
