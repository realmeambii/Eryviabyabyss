import { lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { AuthProvider } from '@/features/auth';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { ThemeProvider } from '@/shared/components/theme-provider';
import { Toaster } from '@/shared/components/ui/toaster';
import { env } from '@/shared/lib/env';
import { createQueryClient } from '@/shared/lib/query-client';

import { AppRoutes } from '@/routes';

/**
 * Devtools are behind a dynamic import, so they become their own chunk and are
 * never fetched unless `env.features.devtools` is on — which it never is in
 * production, whatever the flag file says (see `shared/lib/env.ts`).
 */
const ReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools').then((module) => ({
    default: module.ReactQueryDevtools,
  })),
);

/**
 * Provider order matters:
 *
 *   ErrorBoundary   outermost, so a crash in any provider still renders
 *   ThemeProvider   owns <html data-theme>; nothing below it should flash
 *   QueryClient     AuthProvider's context query needs it
 *   BrowserRouter   AuthProvider's sign-out redirect needs a router
 *   AuthProvider    everything below can assume useAuth() works
 *
 * The client is created at module scope, not inside the component: a new
 * QueryClient on every render would throw the cache away on every state change.
 */
const queryClient = createQueryClient();

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
              <Toaster />
            </AuthProvider>
          </BrowserRouter>

          {env.features.devtools ? (
            <Suspense fallback={null}>
              <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
            </Suspense>
          ) : null}
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
