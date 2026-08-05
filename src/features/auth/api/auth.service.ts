import type { Provider, Session } from '@supabase/supabase-js';
import { z } from 'zod';

import { ROUTES } from '@/shared/lib/constants';
import { env } from '@/shared/lib/env';
import { AppError, toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { UserContext, UserProfile } from '@/shared/types';

import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignUpInput,
} from '../schemas/auth.schemas';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Auth service — every call that touches Supabase Auth lives here.
 * ═══════════════════════════════════════════════════════════════════════════
 *  Components never call `supabase.auth.*` directly. Keeping it in one module
 *  means the redirect URLs, the error translation and the cache reset on
 *  sign-out are defined once instead of being re-derived at each call site.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Absolute redirect targets. Must be listed in `additional_redirect_urls`. */
const redirectTo = {
  emailConfirmation: `${env.appUrl}${ROUTES.callback}`,
  passwordReset: `${env.appUrl}${ROUTES.resetPassword}`,
} as const;

// ── Session ─────────────────────────────────────────────────────────────────

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw toAppError(error);
  return data.session;
}

export function onAuthStateChange(
  callback: (session: Session | null, event: string) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session, event);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

// ── Sign in / out ───────────────────────────────────────────────────────────

export async function signInWithPassword({ email, password }: LoginInput): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw toAppError(error);
  if (!data.session) {
    throw new AppError('Sign-in did not return a session. Try again.', { kind: 'auth' });
  }
  return data.session;
}

/**
 * OAuth. Disabled in Phase 1 (see `[auth.external.*]` in config.toml) but the
 * call path is here so enabling a provider is a dashboard change plus a flag,
 * not a code change.
 */
export async function signInWithOAuth(provider: Provider): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectTo.emailConfirmation,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw toAppError(error);
}

/**
 * Sign out.
 *
 * `scope: 'local'` clears this browser only. Signing out on a shared school
 * computer should not kill the same user's session on their phone.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw toAppError(error);
}

// ── Registration and recovery ───────────────────────────────────────────────

export async function signUp(input: SignUpInput): Promise<{ needsVerification: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: redirectTo.emailConfirmation,
      // Read by handle_new_user(). `role` here is untrusted metadata — the
      // trigger will only honour it if it is 'student' or 'parent'.
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        role: input.role,
      },
    },
  });

  if (error) throw toAppError(error);

  // Supabase returns a user with no session when confirmations are on.
  return { needsVerification: data.session === null };
}

export async function requestPasswordReset({ email }: ForgotPasswordInput): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo.passwordReset,
  });
  if (error) throw toAppError(error);
}

/**
 * Set a new password.
 *
 * Called from the reset screen, where `detectSessionInUrl` has already turned
 * the emailed link into a short-lived recovery session. Without that session
 * GoTrue rejects the update — which is what makes an expired link fail closed.
 */
export async function updatePassword({ password }: ResetPasswordInput): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw toAppError(error);
}

export async function resendVerificationEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: redirectTo.emailConfirmation },
  });
  if (error) throw toAppError(error);
}

// ── User context ────────────────────────────────────────────────────────────

/**
 * PostgREST types a `jsonb` return as `Json`, so the payload arrives as
 * `unknown` in practice. Validating it here means a schema change that drops a
 * field surfaces as a clear error at the boundary rather than as
 * `Cannot read properties of undefined` three components deep.
 */
const gradeBandSchema = z.object({
  grade: z.string(),
  min: z.number(),
  max: z.number(),
  remark: z.string(),
});

const schoolSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  motto: z.string().nullable(),
  logo_path: z.string().nullable(),
  timezone: z.string(),
  locale: z.string(),
  grading_scale: z.array(gradeBandSchema),
});

const childSummarySchema = z.object({
  student_id: z.string(),
  user_id: z.string(),
  full_name: z.string(),
  admission_number: z.string(),
  class_id: z.string().nullable(),
  avatar_path: z.string().nullable(),
});

const sessionSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  term: z.enum(['first', 'second', 'third']),
  starts_on: z.string(),
  ends_on: z.string(),
});

const userContextSchema = z.object({
  // The profile is our own row; validate the identity fields and pass the rest
  // through rather than restating 20 columns that `database.types.ts` owns.
  profile: z.looseObject({
    id: z.string(),
    email: z.string(),
    full_name: z.string(),
    school_id: z.string().nullable(),
  }),
  roles: z.array(z.string()),
  school: schoolSummarySchema.nullable(),
  student_id: z.string().nullable(),
  teacher_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  children: z.array(childSummarySchema),
  current_session: sessionSummarySchema.nullable(),
  unread_notifications: z.number(),
});

/**
 * One round trip for the whole bootstrap: profile, roles, school, role ids,
 * children, current term and unread count.
 *
 * Returns null when there is no signed-in user — a signed-out visitor is not
 * an error.
 */
export async function fetchUserContext(): Promise<UserContext | null> {
  const { data, error } = await supabase.rpc('current_user_context');

  if (error) throw toAppError(error);
  if (data === null || data === undefined) return null;

  const parsed = userContextSchema.safeParse(data);

  if (!parsed.success) {
    throw new AppError(
      'Your profile could not be loaded. Ask your administrator to check your account.',
      {
        kind: 'server',
        detail: parsed.error.issues.map((issue) => issue.path.join('.')).join(', '),
        cause: parsed.error,
      },
    );
  }

  return {
    ...parsed.data,
    profile: parsed.data.profile as unknown as UserProfile,
  };
}

/** Best-effort presence stamp. Never blocks a sign-in. */
export async function touchLastSeen(userId: string): Promise<void> {
  await supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
}
