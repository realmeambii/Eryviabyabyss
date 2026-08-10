import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite configuration.
 *
 * `loadEnv(mode, rootDir, '')` reads *every* variable in `.env*` (not just the
 * `VITE_`-prefixed ones) so build-time-only settings can be read here. Only
 * variables prefixed with `VITE_` are ever inlined into the client bundle —
 * that prefix rule is what keeps `SUPABASE_SERVICE_ROLE_KEY` out of the browser.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '');
  const isProduction = mode === 'production';

  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },

    server: {
      port: Number(env.VITE_DEV_PORT ?? 5173),
      strictPort: false,
      open: false,
    },

    preview: {
      port: Number(env.VITE_PREVIEW_PORT ?? 4173),
    },

    build: {
      target: 'es2022',
      outDir: 'dist',
      // Source maps everywhere but production, where they would expose the
      // full application source to anyone opening devtools.
      sourcemap: !isProduction,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Matched against resolved module ids rather than package names: the
          // object form misses deep entry points such as `react-dom/client`,
          // which is how react-dom ends up back in the main bundle.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router)[\\/@]/.test(id)) {
              return 'vendor-react';
            }
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('@tanstack')) return 'vendor-query';
            if (/[\\/](react-hook-form|@hookform|zod)[\\/]/.test(id)) return 'vendor-forms';
            if (id.includes('@radix-ui')) return 'vendor-radix';
            if (id.includes('lucide-react')) return 'vendor-icons';

            // TipTap drags ProseMirror in behind it — together about 130kB
            // gzipped, and *authoring* code. Rollup was folding it into the
            // same chunk as the sanitiser, so a pupil opening a lesson
            // downloaded the whole editor to read a paragraph they cannot edit.
            // On a Nigerian mobile connection that is the difference between a
            // page that opens and one that does not.
            if (/[\\/]node_modules[\\/](@tiptap|prosemirror-|y-prosemirror)/.test(id)) {
              return 'vendor-editor';
            }
            // Everyone needs this one: `<RichText>` sanitises on every read
            // path, so it must not ride along with the editor.
            if (id.includes('dompurify')) return 'vendor-sanitize';

            return undefined;
          },
        },
      },
    },

    esbuild: {
      // Strip debug logging from production bundles.
      drop: isProduction ? ['debugger'] : [],
    },
  };
});
