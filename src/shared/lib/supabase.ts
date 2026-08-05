import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/shared/types/database.types';

import { env } from './env';

/**
 * The Supabase client — one instance for the whole app.
 *
 * Two clients on one page fight over the same `localStorage` key and race each
 * other refreshing the token, which surfaces as sporadic 401s. Vite's module
 * cache makes this a singleton in the browser; the `globalThis` guard below
 * covers HMR, which re-evaluates modules without clearing them.
 */

const STORAGE_KEY = 'gnaschools.auth';

declare global {
  var __gnaschoolsSupabase: SupabaseClient<Database> | undefined;
}

function createSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      // Sessions survive a reload; the refresh token is rotated on every use
      // (enable_refresh_token_rotation in supabase/config.toml).
      persistSession: true,
      autoRefreshToken: true,
      storageKey: STORAGE_KEY,
      storage: window.localStorage,
      // Password-reset and email-verification links come back as a URL
      // fragment, which this parses and then strips from the address bar.
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-application-name': 'gnaschools-lms',
      },
    },
    realtime: {
      params: {
        // Ten messages a second is generous for a notification badge and stops
        // a chatty table from saturating the socket.
        eventsPerSecond: 10,
      },
    },
  });
}

export const supabase: SupabaseClient<Database> =
  globalThis.__gnaschoolsSupabase ?? createSupabaseClient();

if (!env.isProduction) {
  globalThis.__gnaschoolsSupabase = supabase;
}

/** The storage key the auth session lives under — used by the sign-out path. */
export const AUTH_STORAGE_KEY = STORAGE_KEY;

export type { Database };
