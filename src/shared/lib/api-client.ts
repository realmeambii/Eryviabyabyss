import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { env } from './env';
import { toAppError } from './errors';
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
  const response = await apiClient.post<TResult>(`/${name}`, body ?? {});
  return response.data;
}
