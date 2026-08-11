import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Enums } from '@/shared/types';

/**
 * The audit trail.
 *
 * Append-only by construction: there is no INSERT policy for `authenticated`
 * (the rows come from the `app.audit_row()` trigger, running as definer) and no
 * UPDATE or DELETE policy for anybody. A trail somebody can edit is not a
 * trail, so the absence of those policies is the feature.
 *
 * `audit_logs_select_admin` now requires the `audit` capability, so an
 * administrator without it reads nothing here — and gets an empty list rather
 * than an error, which is the right shape for a screen the nav has already
 * hidden from them.
 */

export type AuditAction = Enums<'audit_action'>;

export interface AuditEntry {
  id: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  changed_columns: string[] | null;
  created_at: string;
  context: unknown;
  actor: { id: string; full_name: string; avatar_path: string | null } | null;
}

export interface AuditFilters {
  entityType?: string;
  action?: AuditAction;
  actorId?: string;
  /** ISO date, inclusive. */
  since?: string;
  limit?: number;
  offset?: number;
}

export interface AuditPage {
  rows: AuditEntry[];
  total: number;
}

export async function listAuditEntries(filters: AuditFilters = {}): Promise<AuditPage> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  let query = supabase
    .from('audit_logs')
    .select(
      `id, action, entity_type, entity_id, before, after, changed_columns, created_at, context,
       actor:users!audit_logs_actor_id_fkey (id, full_name, avatar_path)`,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.entityType) query = query.eq('entity_type', filters.entityType);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.actorId) query = query.eq('actor_id', filters.actorId);
  if (filters.since) query = query.gte('created_at', filters.since);

  const { data, error, count } = await query;
  if (error) throw toAppError(error);

  return { rows: data as unknown as AuditEntry[], total: count ?? 0 };
}

/** Every entity type that actually appears, for the filter. */
export async function listAuditEntityTypes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('entity_type')
    .order('entity_type')
    .limit(1000);

  if (error) throw toAppError(error);
  return [...new Set(data.map((row) => row.entity_type))].sort();
}

/**
 * The columns that actually changed, with their old and new values.
 *
 * `changed_columns` is written by the trigger, so this trusts it rather than
 * diffing the two JSON blobs — a diff computed here would disagree with the one
 * the database recorded the moment a column's representation changes.
 */
export function describeChange(entry: AuditEntry): { column: string; from: string; to: string }[] {
  const before = (entry.before ?? {}) as Record<string, unknown>;
  const after = (entry.after ?? {}) as Record<string, unknown>;

  const columns =
    entry.changed_columns ??
    [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    );

  return columns.map((column) => ({
    column,
    from: render(before[column]),
    to: render(after[column]),
  }));
}

function render(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value === '' ? '—' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * The trail as a spreadsheet, for an inspection.
 *
 * Built from the rows already on screen rather than a fresh unbounded query:
 * an export that quietly differs from what the administrator was looking at is
 * worse than one that matches and says how many rows it covers.
 */
export function auditToCsv(rows: AuditEntry[]): string {
  const header = ['When', 'Who', 'Action', 'Entity', 'Entity id', 'Changed columns'];

  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

  const lines = rows.map((row) =>
    [
      row.created_at,
      row.actor?.full_name ?? 'System',
      row.action,
      row.entity_type,
      row.entity_id ?? '',
      (row.changed_columns ?? []).join(' '),
    ]
      .map((value) => escape(String(value)))
      .join(','),
  );

  return [header.join(','), ...lines].join('\n');
}
