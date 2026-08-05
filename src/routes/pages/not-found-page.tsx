import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { ROUTES } from '@/shared/lib/constants';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-ink-3">
        <Compass className="size-6" aria-hidden />
      </span>
      <div className="space-y-1.5">
        <p className="text-[11px] font-bold tracking-widest text-ink-3 uppercase">Error 404</p>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Page not found</h1>
        <p className="mx-auto max-w-sm text-sm text-ink-2">
          That page does not exist, or it has moved since the link was made.
        </p>
      </div>
      <Button asChild>
        <Link to={ROUTES.root}>Back to my dashboard</Link>
      </Button>
    </div>
  );
}
