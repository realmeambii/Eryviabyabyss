/// <reference types="vite/client" />

/**
 * Compile-time shape of `import.meta.env`.
 *
 * This is the declaration; `@/shared/lib/env` is the *validation*. Types alone
 * cannot tell you that `VITE_SUPABASE_URL` was actually set at build time —
 * only a runtime parse can, and that is what env.ts does on first import.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_ENV: 'local' | 'development' | 'staging' | 'production';
  readonly VITE_APP_URL: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ENABLE_REALTIME?: string;
  readonly VITE_ENABLE_DEVTOOLS?: string;
  readonly VITE_DEV_PORT?: string;
  readonly VITE_PREVIEW_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
