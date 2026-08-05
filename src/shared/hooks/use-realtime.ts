import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { env } from '@/shared/lib/env';
import { supabase } from '@/shared/lib/supabase';

type PostgresEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface RealtimeOptions {
  /** Table in `public` to watch. Must be in the `supabase_realtime` publication. */
  table: string;
  event?: PostgresEvent;
  /** PostgREST filter, e.g. `user_id=eq.<uuid>`. */
  filter?: string;
  /** Query keys to invalidate when a change arrives. */
  invalidate?: QueryKey[];
  onChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  enabled?: boolean;
}

/**
 * Subscribe to Postgres changes and refresh the affected queries.
 *
 * Realtime applies the same RLS policies as a SELECT, so a subscription can
 * only ever deliver rows the caller could have queried anyway — the `filter`
 * argument is for reducing traffic, not for access control.
 *
 * The handler invalidates rather than patching the cache: a change event
 * carries the row, but not the joins the UI is showing, and refetching a
 * 30-row list is cheaper than reconciling a partial update incorrectly.
 */
export function useRealtime({
  table,
  event = '*',
  filter,
  invalidate = [],
  onChange,
  enabled = true,
}: RealtimeOptions): void {
  const queryClient = useQueryClient();

  // Kept in a ref so a new inline callback on every render does not tear down
  // and rebuild the websocket subscription.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const invalidateKey = JSON.stringify(invalidate);

  useEffect(() => {
    if (!enabled || !env.features.realtime) return;

    const channelName = `realtime:${table}:${filter ?? 'all'}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event, schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          onChangeRef.current?.(payload);
          for (const key of JSON.parse(invalidateKey) as QueryKey[]) {
            void queryClient.invalidateQueries({ queryKey: key });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, event, filter, enabled, invalidateKey, queryClient]);
}
