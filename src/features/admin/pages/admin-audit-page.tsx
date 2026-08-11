import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Download, ShieldCheck } from 'lucide-react';

import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { queryKeys } from '@/shared/lib/query-keys';
import { cn } from '@/shared/utils/cn';
import { formatDateTime } from '@/shared/utils/format';

import {
  auditToCsv,
  describeChange,
  listAuditEntityTypes,
  listAuditEntries,
  type AuditAction,
  type AuditEntry,
} from '../api/audit.service';
import { useCan } from '../hooks/use-administrators';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  The audit log
 * ═══════════════════════════════════════════════════════════════════════════
 *  Who changed what, and when. Append-only by construction: the rows are
 *  written by the `app.audit_row()` trigger running as definer, and there is no
 *  UPDATE or DELETE policy on the table for anybody at all. A trail somebody can
 *  edit is not a trail, so the absence of those policies is the feature.
 *
 *  The diff comes from `changed_columns`, which the trigger recorded at the
 *  time, rather than from diffing the two JSON blobs here. A diff computed in
 *  the client would start disagreeing with the database the moment a column's
 *  representation changed, and the disagreement would be silent.
 *
 *  Reading it needs the `audit` capability. An administrator without it gets an
 *  empty list rather than an error — the nav has already hidden the entry, and
 *  a page that shouts at somebody who typed a URL is noise.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ACTIONS: { value: AuditAction | ''; label: string }[] = [
  { value: '', label: 'Every action' },
  { value: 'insert', label: 'Created' },
  { value: 'update', label: 'Changed' },
  { value: 'delete', label: 'Deleted' },
  { value: 'permission_change', label: 'Permission change' },
  { value: 'login', label: 'Signed in' },
  { value: 'logout', label: 'Signed out' },
  { value: 'export', label: 'Exported' },
];

const ACTION_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  insert: 'success',
  update: 'warning',
  delete: 'danger',
  permission_change: 'danger',
};

const PAGE_SIZE = 50;

export default function AdminAuditPage() {
  const canRead = useCan('audit');

  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [since, setSince] = useState('');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      entityType: entityType || undefined,
      action: action || undefined,
      since: since || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [entityType, action, since, page],
  );

  const entries = useQuery({
    queryKey: queryKeys.audit.list(filters),
    queryFn: () => listAuditEntries(filters),
    staleTime: 30_000,
  });

  const entityTypes = useQuery({
    queryKey: queryKeys.audit.entityTypes(),
    queryFn: listAuditEntityTypes,
    staleTime: 10 * 60_000,
  });

  const rows = entries.data?.rows ?? [];
  const total = entries.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const download = () => {
    const blob = new Blob([auditToCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Who changed what, and when. Append-only — nothing here can be edited or removed, by anyone."
        actions={
          rows.length > 0 ? (
            <Button variant="secondary" onClick={download}>
              <Download className="size-4" aria-hidden />
              Export this page
            </Button>
          ) : null
        }
      />

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="au-entity">Record type</Label>
          <Select
            id="au-entity"
            className="w-48"
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value);
              setPage(0);
            }}
            options={[
              { value: '', label: 'Everything' },
              ...(entityTypes.data ?? []).map((value) => ({ value, label: value })),
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="au-action">Action</Label>
          <Select
            id="au-action"
            className="w-44"
            value={action}
            onChange={(event) => {
              setAction(event.target.value as AuditAction | '');
              setPage(0);
            }}
            options={ACTIONS}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="au-since">Since</Label>
          <Input
            id="au-since"
            type="date"
            className="w-40"
            value={since}
            onChange={(event) => {
              setSince(event.target.value);
              setPage(0);
            }}
          />
        </div>

        <p className="ml-auto text-[13px] text-ink-3">
          {entries.isPending ? 'Loading…' : `${total} ${total === 1 ? 'entry' : 'entries'}`}
        </p>
      </div>

      {/* ── Trail ────────────────────────────────────────────────────────── */}
      {entries.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={canRead ? 'Nothing recorded' : 'No access to the audit log'}
          description={
            canRead
              ? 'No changes match these filters.'
              : 'Reading the audit log needs the audit permission. The founding administrator grants it.'
          }
        />
      ) : (
        <>
          <ul className="space-y-1.5">
            {rows.map((entry) => (
              <AuditRow
                key={entry.id}
                entry={entry}
                open={expanded === entry.id}
                onToggle={() => {
                  setExpanded((current) => (current === entry.id ? null : entry.id));
                }}
              />
            ))}
          </ul>

          {lastPage > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => {
                  setPage((current) => Math.max(0, current - 1));
                }}
              >
                Previous
              </Button>
              <span className="text-[12.5px] text-ink-3">
                Page {page + 1} of {lastPage + 1}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= lastPage}
                onClick={() => {
                  setPage((current) => Math.min(lastPage, current + 1));
                }}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ── One entry ───────────────────────────────────────────────────────────────

function AuditRow({
  entry,
  open,
  onToggle,
}: {
  entry: AuditEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const changes = open ? describeChange(entry) : [];
  const tone = ACTION_TONE[entry.action] ?? 'neutral';

  return (
    <li>
      <Card>
        <CardContent className="p-0">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left"
          >
            {entry.actor ? (
              <UserAvatar
                fullName={entry.actor.full_name}
                avatarPath={entry.actor.avatar_path}
                className="size-7 shrink-0"
              />
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold text-ink-3">
                SYS
              </span>
            )}

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-ink">
                <strong className="font-semibold">{entry.actor?.full_name ?? 'System'}</strong>{' '}
                {verb(entry.action)} <span className="text-ink-2">{entry.entity_type}</span>
              </span>
              <span className="block text-[11.5px] text-ink-3">
                {formatDateTime(entry.created_at)}
                {entry.changed_columns && entry.changed_columns.length > 0
                  ? ` · ${entry.changed_columns.length} ${entry.changed_columns.length === 1 ? 'field' : 'fields'}`
                  : ''}
              </span>
            </span>

            <Badge variant={tone}>{entry.action.replace('_', ' ')}</Badge>

            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-ink-3 transition-transform',
                open && 'rotate-180',
              )}
              aria-hidden
            />
          </button>

          {open ? (
            <div className="border-t border-border px-4 py-3">
              {changes.length === 0 ? (
                <p className="text-[12.5px] text-ink-3">
                  No field-level detail was recorded for this entry.
                </p>
              ) : (
                <table className="w-full text-left text-[12.5px]">
                  <thead>
                    <tr className="text-ink-3">
                      <th className="pb-1 font-semibold">Field</th>
                      <th className="pb-1 font-semibold">Was</th>
                      <th className="pb-1 font-semibold">Became</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {changes.map((change) => (
                      <tr key={change.column}>
                        <td className="py-1 pr-3 font-medium text-ink">{change.column}</td>
                        <td className="py-1 pr-3 break-all text-ink-3">{change.from}</td>
                        <td className="py-1 break-all text-ink">{change.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {entry.entity_id ? (
                <p className="pt-2 font-mono text-[11px] text-ink-3">{entry.entity_id}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </li>
  );
}

function verb(action: string): string {
  switch (action) {
    case 'insert':
      return 'created a';
    case 'update':
      return 'changed a';
    case 'delete':
      return 'deleted a';
    case 'permission_change':
      return 'changed permissions on';
    case 'login':
      return 'signed in —';
    case 'logout':
      return 'signed out —';
    case 'export':
      return 'exported';
    default:
      return 'touched a';
  }
}
