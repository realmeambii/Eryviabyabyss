import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

import { Alert, AlertDescription } from '@/shared/components/ui/alert';
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
import { ROLE_HOME, ROUTES } from '@/shared/lib/constants';
import { errorMessage } from '@/shared/lib/errors';

import { useAuth } from '../hooks/use-auth';
import { useSignIn } from '../hooks/use-auth-mutations';
import { loginSchema, type LoginInput } from '../schemas/auth.schemas';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { primaryRole } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
    mode: 'onSubmit',
  });

  const signIn = useSignIn(() => {
    // Back to wherever they were headed; otherwise their own portal. The
    // provider has not refreshed `primaryRole` yet at this point, so `/` does
    // the redirect once the context query lands.
    void navigate(from ?? (primaryRole ? ROLE_HOME[primaryRole] : ROUTES.root), { replace: true });
  });

  const onSubmit = form.handleSubmit((values) => {
    signIn.mutate(values);
  });

  return (
    <div className="w-full max-w-[380px]">
      <h1 className="text-[32px] leading-tight font-extrabold tracking-tight text-ink">
        Welcome back
      </h1>
      <p className="mt-2 mb-8 text-sm text-ink-2">
        Sign in to reach your lessons, assignments and results.
      </p>

      {signIn.isError ? (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{errorMessage(signIn.error)}</AlertDescription>
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
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    to={ROUTES.forgotPassword}
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowPassword((value) => !value);
                      }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 grid w-10 place-items-center text-ink-3 hover:text-ink-2"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" aria-hidden />
                      ) : (
                        <Eye className="size-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="rememberMe"
            render={({ field }) => (
              <FormItem>
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(event) => {
                      field.onChange(event.target.checked);
                    }}
                    onBlur={field.onBlur}
                    name={field.name}
                    className="size-3.5 accent-brand"
                  />
                  Keep me signed in on this device
                </label>
              </FormItem>
            )}
          />

          <Button type="submit" block loading={signIn.isPending} className="mt-2">
            Sign in
          </Button>
        </form>
      </Form>

      <p className="mt-8 text-center text-[13px] text-ink-3">
        Need an account? Ask your school administrator to invite you.
      </p>
    </div>
  );
}
