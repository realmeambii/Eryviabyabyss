import { AuthError, type PostgrestError } from '@supabase/supabase-js';
import { AxiosError } from 'axios';

/**
 * One error vocabulary for the whole app.
 *
 * Supabase throws three unrelated shapes (PostgrestError, AuthError, StorageError)
 * and Axios a fourth. Every one of them is normalised here into an `AppError`
 * carrying a message that is safe — and useful — to show a teacher.
 */

export type AppErrorKind =
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'network'
  | 'rate_limit'
  | 'server'
  | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly code: string | undefined;
  readonly detail: string | undefined;
  override readonly cause: unknown;

  constructor(
    message: string,
    options: { kind?: AppErrorKind; code?: string; detail?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.kind = options.kind ?? 'unknown';
    this.code = options.code;
    this.detail = options.detail;
    this.cause = options.cause;
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return this.kind === 'network' || this.kind === 'server' || this.kind === 'rate_limit';
  }
}

/**
 * Postgres SQLSTATE → what the user should be told.
 *
 * `42501` is the one that matters most: it is what an RLS policy returns when
 * it denies a write. "You do not have permission" is the honest message —
 * leaking which policy failed would tell an attacker how the rules are shaped.
 */
const POSTGRES_ERRORS: Record<string, { kind: AppErrorKind; message: string }> = {
  '23505': { kind: 'conflict', message: 'That record already exists.' },
  '23503': { kind: 'validation', message: 'A related record is missing or has been removed.' },
  '23514': { kind: 'validation', message: 'That value is not allowed.' },
  '23502': { kind: 'validation', message: 'A required field is missing.' },
  '23P01': { kind: 'conflict', message: 'That slot clashes with an existing one.' },
  '22P02': { kind: 'validation', message: 'That value is not in the expected format.' },
  '42501': { kind: 'permission', message: 'You do not have permission to do that.' },
  '42P01': { kind: 'server', message: 'The server is misconfigured. Contact your administrator.' },
  P0001: { kind: 'validation', message: 'That action was rejected by a rule.' },
  P0002: { kind: 'not_found', message: 'That record could not be found.' },
  PGRST116: { kind: 'not_found', message: 'That record could not be found.' },
  PGRST301: { kind: 'auth', message: 'Your session has expired. Please sign in again.' },
  '57014': { kind: 'server', message: 'That request took too long. Try narrowing it down.' },
};

function isPostgrestError(value: unknown): value is PostgrestError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    'code' in value &&
    'details' in value
  );
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  // ── Supabase Auth ───────────────────────────────────────────────────────
  if (error instanceof AuthError) {
    const status = error.status ?? 0;
    if (status === 429) {
      return new AppError('Too many attempts. Wait a minute and try again.', {
        kind: 'rate_limit',
        code: error.code,
        cause: error,
      });
    }
    return new AppError(humaniseAuthMessage(error.message), {
      kind: 'auth',
      code: error.code,
      cause: error,
    });
  }

  // ── PostgREST / Postgres ────────────────────────────────────────────────
  if (isPostgrestError(error)) {
    const mapped = POSTGRES_ERRORS[error.code];
    if (mapped) {
      return new AppError(mapped.message, {
        kind: mapped.kind,
        code: error.code,
        // `hint` is written by us in RAISE EXCEPTION and is safe to surface;
        // `details` can contain column values, so it stays in the console.
        detail: error.hint ?? undefined,
        cause: error,
      });
    }
    return new AppError(error.message || 'The request could not be completed.', {
      kind: 'server',
      code: error.code,
      cause: error,
    });
  }

  // ── Axios (Edge Functions) ──────────────────────────────────────────────
  if (error instanceof AxiosError) {
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
      return new AppError('Could not reach the server. Check your connection.', {
        kind: 'network',
        code: error.code,
        cause: error,
      });
    }

    const status = error.response?.status ?? 0;
    const kind: AppErrorKind =
      status === 401 || status === 403
        ? 'permission'
        : status === 404
          ? 'not_found'
          : status === 409
            ? 'conflict'
            : status === 422
              ? 'validation'
              : status === 429
                ? 'rate_limit'
                : status >= 500
                  ? 'server'
                  : 'unknown';

    const body = error.response?.data as { message?: string; error?: string } | undefined;
    return new AppError(body?.message ?? body?.error ?? error.message ?? 'Something went wrong.', {
      kind,
      code: String(status),
      cause: error,
    });
  }

  if (error instanceof Error) {
    // Same reason as `humaniseAuthMessage`: a thrown value is not obliged to
    // honour the `Error` shape it claims.
    return new AppError(error.message ?? 'Something went wrong.', {
      kind: 'unknown',
      cause: error,
    });
  }

  return new AppError('Something went wrong.', { kind: 'unknown', cause: error });
}

/**
 * GoTrue's wording is developer-facing; these are the ones users actually hit.
 *
 * The parameter is typed `string` on `AuthError`, but the type is a claim
 * about a value that crossed a network and a library boundary, not a
 * guarantee. When a fetch fails outright — a blocked preflight, say — the
 * message can arrive undefined, and `undefined.toLowerCase()` then threw
 * *inside the error handler*, replacing whatever went wrong with a
 * `TypeError` from a stack frame that had nothing to do with it. Anything on
 * this path has to be total.
 */
function humaniseAuthMessage(message: string | null | undefined): string {
  if (!message) return 'Something went wrong.';
  const normalised = message.toLowerCase();

  if (normalised.includes('invalid login credentials')) {
    return 'That email and password do not match an account.';
  }
  if (normalised.includes('email not confirmed')) {
    return 'Confirm your email address before signing in. Check your inbox for the link.';
  }
  if (normalised.includes('user already registered')) {
    return 'An account already exists for that email address.';
  }
  if (normalised.includes('password should be at least')) {
    return 'That password is too short.';
  }
  if (normalised.includes('same password')) {
    return 'Choose a password you have not used before.';
  }
  if (normalised.includes('token has expired') || normalised.includes('invalid or has expired')) {
    return 'That link has expired. Request a new one.';
  }
  return message;
}

/** Convenience for `catch` blocks that only need the text. */
export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}
