import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { AppError, toAppError } from './errors';

/**
 * TanStack Query configuration.
 *
 * Two decisions worth stating:
 *
 *  1. Failed *mutations* toast; failed *queries* do not. A query failure is
 *     usually rendered in place by the component that owns it — toasting as
 *     well produces two error messages for one problem. A mutation failure has
 *     no natural home in the UI, so it needs the toast.
 *
 *     A mutation that *does* have a natural home — a long form that should
 *     show "that admission number is already in use" next to the field rather
 *     than in a toast that fades — opts out with
 *     `meta: { silenceErrorToast: true }` and takes responsibility for
 *     rendering the failure itself.
 *
 *  2. Nothing retries a permission or validation error. RLS denying a write
 *     will deny it again three times over; retrying only delays the message.
 */

/** Set on a mutation's `meta` to take ownership of rendering its own errors. */
export interface MutationMeta {
  silenceErrorToast?: boolean;
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  const appError = toAppError(error);
  if (!appError.isRetryable) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // School data is not a live ticker: half a minute of staleness is
        // invisible to the user and removes most refetch traffic.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        throwOnError: false,
      },
      mutations: {
        retry: false,
        throwOnError: false,
      },
    },

    queryCache: new QueryCache({
      onError: (error, query) => {
        const appError = toAppError(error);

        // An expired session is handled once, by the auth listener, rather
        // than by every query that happened to be in flight.
        if (appError.kind === 'auth') return;

        if (import.meta.env.DEV) {
          console.error('[query]', query.queryKey, appError.code ?? '', appError.message);
        }
      },
    }),

    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        const appError = toAppError(error);
        if (appError.kind === 'auth') return;

        const meta = mutation.options.meta as MutationMeta | undefined;
        if (meta?.silenceErrorToast) return;

        toast.error(appError.message, {
          description: appError.detail,
        });
      },
    }),
  });
}

export { AppError };
