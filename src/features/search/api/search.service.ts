import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Global search
 * ═══════════════════════════════════════════════════════════════════════════
 *  One RPC across six tables, so the box is one round trip rather than six that
 *  arrive out of order and re-sort the list under the user's cursor.
 *
 *  `global_search` is SECURITY INVOKER, which is the whole design: every branch
 *  of its UNION is an ordinary SELECT, so each table's own policy scopes its own
 *  branch. Nothing here filters by role — a pupil searching a classmate's name
 *  gets nothing back because `students_select_authorised` returns nothing, not
 *  because this file decided so.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type SearchKind = 'student' | 'class' | 'subject' | 'assignment' | 'lesson' | 'quiz';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
}

const KINDS = new Set<string>([
  'student',
  'class',
  'subject',
  'assignment',
  'lesson',
  'quiz',
] satisfies SearchKind[]);

export async function globalSearch(term: string, limitPerKind = 5): Promise<SearchHit[]> {
  const query = term.trim();
  if (query.length < 2) return [];

  const { data, error } = await supabase.rpc('global_search', {
    p_query: query,
    p_limit: limitPerKind,
  });

  if (error) throw toAppError(error);

  // `kind` is a text column rather than an enum, so it is narrowed here rather
  // than asserted. A kind the UI does not know about is dropped instead of
  // rendering an untitled row with no icon.
  return (data ?? [])
    .filter((row): row is typeof row & { kind: SearchKind } => KINDS.has(row.kind))
    .map((row) => ({
      kind: row.kind,
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
    }));
}
