import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { LoadingScreen } from '@/shared/components/loading-screen';
import { MIN_PASSWORD_LENGTH, ROUTES } from '@/shared/lib/constants';
import { errorMessage } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import { cn } from '@/shared/utils/cn';

import { useUpdatePassword } from '../hooks/use-auth-mutations';
import { resetPasswordSchema, type ResetPasswordInput } from '../schemas/auth.schemas';

type LinkState = 'checking' | 'valid' | 'invalid';

export default function ResetPasswordPage() {
  const [linkState, setLinkState] = useState<LinkState>('checking');

  /**
   * The emailed link carries a recovery token in the URL fragment. The
   * Supabase client (`detectSessionInUrl: true`) exchanges it for a short-lived
   * session before this component settles — so "is there a session?" is the
   * same question as "was the link valid and unexpired?".
   */
  useEffect(() => {
    let active = true;

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || session) setLinkState('valid');
    });

    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!active) return;
      setLinkState(sessionData.session ? 'valid' : 'invalid');
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onChange',
  });

  const update = useUpdatePassword();
  const password = form.watch('password');

  const rules = [
    {
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    { label: 'Contains a letter', met: /[a-z]/i.test(password) },
    { label: 'Contains a number', met: /\d/.test(password) },
  ];

  const onSubmit = form.handleSubmit((values) => {
    update.mutate(values);
  });

  if (linkState === 'checking') return <LoadingScreen label="Checking your link…" />;

  if (linkState === 'invalid') {
    return (
      <div className="w-full max-w-[380px]">
        <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-ink">
          This link has expired
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          Reset links are valid for one hour and can only be used once. Request a new one and try
          again.
        </p>
        <Button asChild block className="mt-8">
          <Link to={ROUTES.forgotPassword}>Request a new link</Link>
        </Button>
        <Button asChild variant="ghost" block className="mt-2">
          <Link to={ROUTES.login}>Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[380px]">
      <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-ink">
        Set a new password
      </h1>
      <p className="mt-2 mb-8 text-sm text-ink-2">
        Choose something you have not used on this account before.
      </p>

      {update.isError ? (
        <Alert variant="destructive" className="mb-5">
          <AlertTitle>Could not update your password</AlertTitle>
          <AlertDescription>{errorMessage(update.error)}</AlertDescription>
        </Alert>
      ) : null}

      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="new-password" autoFocus />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <ul className="space-y-1.5">
            {rules.map((rule) => (
              <li
                key={rule.label}
                className={cn(
                  'flex items-center gap-2 text-[12.5px] font-medium',
                  rule.met ? 'text-success' : 'text-ink-3',
                )}
              >
                {rule.met ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <X className="size-3.5" aria-hidden />
                )}
                {rule.label}
              </li>
            ))}
          </ul>

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="new-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" block loading={update.isPending} className="mt-2">
            Update password
          </Button>
        </form>
      </Form>
    </div>
  );
}
