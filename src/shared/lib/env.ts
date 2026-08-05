import { z } from 'zod';

/**
 * Environment validation.
 *
 * Parsed once, at module load, before anything else runs. A missing Supabase
 * URL should fail loudly on the first paint of a preview deploy — not three
 * screens in, as an unreadable `TypeError: Failed to fetch`.
 */

const booleanish = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((value) => value === 'true' || value === '1');

const schema = z.object({
  VITE_SUPABASE_URL: z.url('VITE_SUPABASE_URL must be a URL, e.g. https://xyz.supabase.co'),

  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'VITE_SUPABASE_ANON_KEY looks truncated — copy the whole key'),

  VITE_APP_ENV: z.enum(['local', 'development', 'staging', 'production']).default('local'),

  VITE_APP_URL: z.url().default('http://localhost:5173'),

  VITE_API_BASE_URL: z.url().optional(),

  VITE_ENABLE_REALTIME: booleanish.default(true),
  VITE_ENABLE_DEVTOOLS: booleanish.default(true),
});

function parseEnv() {
  const result = schema.safeParse(import.meta.env);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration.\n\n${detail}\n\n` +
        'Copy .env.example to .env.local and fill in the blanks.',
    );
  }

  return result.data;
}

const parsed = parseEnv();

/**
 * A service-role key in a browser bundle is a full database compromise: it
 * bypasses every RLS policy in the project. Vite will not inline an unprefixed
 * variable, so reaching this branch means somebody renamed one to `VITE_…`.
 */
function assertNoServerSecrets(): void {
  const leaked = Object.keys(import.meta.env).filter((key) =>
    /SERVICE_ROLE|SECRET|PRIVATE_KEY|DB_PASSWORD|ACCESS_TOKEN/i.test(key),
  );

  if (leaked.length > 0) {
    throw new Error(
      `Server-only secrets are exposed to the browser: ${leaked.join(', ')}. ` +
        'Remove the VITE_ prefix and rotate the credential immediately.',
    );
  }
}

assertNoServerSecrets();

export const env = {
  supabaseUrl: parsed.VITE_SUPABASE_URL,
  supabaseAnonKey: parsed.VITE_SUPABASE_ANON_KEY,

  appEnv: parsed.VITE_APP_ENV,
  appUrl: parsed.VITE_APP_URL.replace(/\/$/, ''),

  /** Edge Function gateway. Defaults to the project's own functions endpoint. */
  apiBaseUrl:
    parsed.VITE_API_BASE_URL ?? `${parsed.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1`,

  isProduction: parsed.VITE_APP_ENV === 'production',
  isLocal: parsed.VITE_APP_ENV === 'local',

  features: {
    realtime: parsed.VITE_ENABLE_REALTIME,
    // Devtools are never shipped to production, whatever the flag says.
    devtools: parsed.VITE_ENABLE_DEVTOOLS && parsed.VITE_APP_ENV !== 'production',
  },
} as const;

export type Env = typeof env;
