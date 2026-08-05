import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { env } from './env';
import { AppError, toAppError } from './errors';
import { supabase } from './supabase';

/**
 * Axios instance for Edge Functions and third-party HTTP.
 *
 * Deliberately *not* used for the database — `supabase-js` already handles
 * PostgREST, and routing table reads through a second HTTP layer would lose
 * the generated types and the RLS-aware session handling.
 *
 * What it is for: the Edge Functions in `supabase/functions/`, which are plain
 * HTTP endpoints needing the caller's JWT, a timeout and consistent error
 * shaping — exactly what an interceptor pair is good at.
 */

export const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 20_000,
  headers: {
    'Content-Type': 'application/json',
    'x-application-name': 'gnaschools-lms',
  },
});

/**
 * Attach the current access token. `getSession()` returns from memory and only
 * hits the network when the token is within its refresh window, so this is
 * cheap enough to run per request — and it means a token refreshed mid-flight
 * is picked up without a page reload.
 */
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  // Supabase's gateway requires the publishable key alongside the JWT.
  config.headers.set('apikey', env.supabaseAnonKey);

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const appError = toAppError(error);

    if (import.meta.env.DEV) {
      console.error('[api]', appError.code ?? '', appError.message);
    }

    // Reject with the normalised error so callers only ever handle one shape.
    return Promise.reject(appError);
  },
);

/** Typed helper: `await invokeFunction<Result>('daily-reminders', body)`. */
export async function invokeFunction<TResult, TBody = unknown>(
  name: string,
  body?: TBody,
): Promise<TResult> {
  try {
    const response = await apiClient.post<TResult>(`/${name}`, body ?? {});
    return response.data;
  } catch (cause) {
    throw describeFunctionFailure(name, cause);
  }
}

/**
 * Tell "the function said no" apart from "there is no function".
 *
 * These two arrive at the browser looking identical — a non-2xx with a JSON
 * body — but they need opposite responses. A 409 from our own code means the
 * administrator should change the email address they typed. A gateway that
 * cannot find the function behind it means nobody typed anything wrong and no
 * amount of retrying will help.
 *
 * The tell is the body shape: `_shared/cors.ts` gives every one of our error
 * responses an `error` key. Anything else at these statuses was written by the
 * gateway, and its prose is addressed to an operator, not a teacher — Kong
 * answers "name resolution failed" when the functions container is not up,
 * which reads like a DNS problem on the user's own machine.
 */
function describeFunctionFailure(name: string, cause: unknown): AppError {
  const appError = toAppError(cause);

  // The interceptor above already normalised this, so what arrives here is an
  // AppError holding the AxiosError as its `cause` — not the AxiosError itself.
  const axiosError =
    cause instanceof AxiosError
      ? cause
      : appError.cause instanceof AxiosError
        ? appError.cause
        : null;

  // Axios types `data` as `any`; annotating it back to `unknown` is what keeps
  // the checks below honest rather than silently passing on an untyped value.
  const body: unknown = axiosError?.response?.data;
  const isOurs = typeof body === 'object' && body !== null && 'error' in body;

  if (isOurs) return appError;

  const status = axiosError?.response?.status ?? 0;
  const unreachable = appError.kind === 'network' || status === 404 || status >= 500;

  if (!unreachable) return appError;

  return new AppError(
    `The “${name}” service is not available. Nothing was changed. Ask your administrator to check that it is deployed.`,
    {
      kind: 'server',
      code: appError.code,
      // The operator-facing half, shown in the toast description and the
      // console. Only useful to whoever runs the stack, so it stays out of the
      // headline.
      detail: import.meta.env.DEV
        ? `Start it locally with \`npm run fn:serve\` (needs supabase/functions/.env), or deploy with \`npx supabase functions deploy ${name}\`. Gateway said: ${appError.message}`
        : appError.message,
      cause,
    },
  );
}
