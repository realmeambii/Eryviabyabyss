import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Two clients, two very different powers. Choosing the wrong one is the most
 * common way an Edge Function turns into a data leak.
 *
 *   userClient(request)  — carries the caller's JWT. Every query it makes is
 *                          still evaluated against RLS. Use this by default.
 *
 *   adminClient()        — service role. Bypasses RLS entirely. Only for work
 *                          that is genuinely school-wide and has no caller:
 *                          the nightly reminder sweep, for instance.
 */

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function userClient(request: Request): SupabaseClient {
  const authorization = request.headers.get('Authorization') ?? '';

  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve the caller from their JWT. Returns null when unauthenticated. */
export async function currentUser(request: Request) {
  const client = userClient(request);
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user;
}

/**
 * Guard for scheduler-invoked functions.
 *
 * These run with `verify_jwt = false` because there is no signed-in user
 * behind a cron trigger — so a shared secret takes the JWT's place. Compared
 * in constant time so the check cannot be probed a byte at a time.
 */
export function isAuthorisedCron(request: Request): boolean {
  const expected = Deno.env.get('FUNCTION_CRON_SECRET');
  if (!expected) return false;

  const provided = request.headers.get('x-cron-secret') ?? '';
  if (provided.length !== expected.length) return false;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }
  return mismatch === 0;
}
