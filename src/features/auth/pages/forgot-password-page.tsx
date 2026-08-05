import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';

import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { ROUTES } from '@/shared/lib/constants';
import { errorMessage } from '@/shared/lib/errors';

import { useRequestPasswordReset } from '../hooks/use-auth-mutations';
import { forgotPasswordSchema, type ForgotPasswordInput } from '../schemas/auth.schemas';

export default function ForgotPasswordPage() {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const request = useRequestPasswordReset();

  const onSubmit = form.handleSubmit((values) => {
    request.mutate(values);
  });

  /**
   * The success state does not say whether the address exists. Confirming it
   * would turn this form into an account-enumeration oracle, and Supabase
   * returns the same response either way.
   */
  if (request.isSuccess) {
    return (
      <div className="w-full max-w-[380px]">
        <span className="mb-6 grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-ink">
          Check your inbox
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          If an account exists for <strong className="text-ink">{form.getValues('email')}</strong>,
          a reset link is on its way. It expires in one hour.
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
          Nothing after a few minutes? Check your spam folder, or ask your school administrator to
          confirm the address on your account.
        </p>

        <Button asChild variant="secondary" block className="mt-8">
          <Link to={ROUTES.login}>
            <ArrowLeft className="size-4" aria-hidden />
            Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[380px]">
      <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-ink">
        Forgot your password?
      </h1>
      <p className="mt-2 mb-8 text-sm text-ink-2">
        Enter your email address and we will send you a link to set a new one.
      </p>

      {request.isError ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{errorMessage(request.error)}</AlertDescription>
        </Alert>
      ) : null}

      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="you@gnaschools.edu.ng"
                  />
                </FormControl>
                <FormDescription>Use the address your school has on file.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" block loading={request.isPending} className="mt-2">
            Send reset link
          </Button>
        </form>
      </Form>

      <Button asChild variant="ghost" block className="mt-4">
        <Link to={ROUTES.login}>
          <ArrowLeft className="size-4" aria-hidden />
          Back to sign in
        </Link>
      </Button>
    </div>
  );
}
