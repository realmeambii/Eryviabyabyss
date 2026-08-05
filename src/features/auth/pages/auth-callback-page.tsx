import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck, TriangleAlert } from 'lucide-react';

import { LoadingScreen } from '@/shared/components/loading-screen';
import { Button } from '@/shared/components/ui/button';
import { ROUTES } from '@/shared/lib/constants';
import { supabase } from '@/shared/lib/supabase';

/**
 * Where email-verification and OAuth links land.
 *
 * By the time this renders, the Supabase client has already exchanged the code
 * in the URL for a session. All that is left is to decide where to send the
 * user — and to say something useful if the link had already been used.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;

      if (data.session) {
        // `/` resolves to the right portal once the context query lands.
        void navigate(ROUTES.root, { replace: true });
      } else {
        setFailed(true);
      }
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  if (!failed) return <LoadingScreen label="Confirming your account…" />;

  return (
    <div className="w-full max-w-[380px] text-center">
      <span className="mx-auto mb-6 grid size-12 place-items-center rounded-full bg-warning-soft text-warning">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-ink">
        That link did not work
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">
        It may have already been used, or it may have expired. Sign in normally — if your account is
        confirmed, it will just work.
      </p>
      <Button asChild block className="mt-8">
        <Link to={ROUTES.login}>Go to sign in</Link>
      </Button>
    </div>
  );
}

/** Shown straight after sign-up, while the user goes to find the email. */
export function VerifyEmailPage() {
  return (
    <div className="w-full max-w-[380px]">
      <span className="mb-6 grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
        <MailCheck className="size-6" aria-hidden />
      </span>
      <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-ink">
        Confirm your email
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">
        We have sent a confirmation link to your inbox. Open it to activate your account — you will
        not be able to sign in until you do.
      </p>
      <Button asChild variant="secondary" block className="mt-8">
        <Link to={ROUTES.login}>Back to sign in</Link>
      </Button>
    </div>
  );
}
