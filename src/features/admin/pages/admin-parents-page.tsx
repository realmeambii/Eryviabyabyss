import { useMemo, useState } from 'react';
import { Link2, Plus, Search, UsersRound, X } from 'lucide-react';

import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { DataTable, type Column } from '@/shared/components/data-table';
import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Select } from '@/shared/components/ui/select';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import type { GuardianRelationship } from '@/shared/types';

import type { ParentChildRow, ParentRow } from '../api/users.service';
import { AccountActions } from '../components/account-actions';
import { AccountStatusBadge } from '../components/account-status-badge';
import { NewUserDialog } from '../components/new-user-dialog';
import { useParentMutations, useParents, useStudentOptions } from '../hooks/use-admin-users';

/**
 * The guardian register.
 *
 * The children column is the whole point of this screen. Every parent-side RLS
 * policy in the project resolves through `parent_students` — `app.is_my_child()`
 * is the predicate behind results, grades and timetable — so a guardian
 * with no links signs in successfully and sees an empty portal. Making the
 * links visible and editable here is what stops that looking like a bug.
 */

const RELATIONSHIPS: { value: GuardianRelationship; label: string }[] = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'other', label: 'Other' },
];

export default function AdminParentsPage() {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [managingId, setManagingId] = useState<string | null>(null);
  const debounced = useDebouncedValue(search, 250);

  const { data, isPending, error } = useParents();

  // Resolved against the live list rather than held as a captured row, so a
  // link added inside the dialog appears without closing and reopening it.
  const managing = managingId
    ? ((data ?? []).find((parent) => parent.id === managingId) ?? null)
    : null;

  const rows = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    if (term === '') return data ?? [];

    return (data ?? []).filter((parent) =>
      [
        parent.user?.full_name,
        parent.user?.email,
        parent.user?.phone,
        // Searching by the child's name is how a school secretary actually
        // finds a guardian: the caller on the phone says "I'm Tunde's mother".
        ...parent.children.map((child) => child.full_name),
      ].some((field) => (field ?? '').toLowerCase().includes(term)),
    );
  }, [data, debounced]);

  const columns: Column<ParentRow>[] = [
    {
      id: 'parent',
      header: 'Parent / guardian',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <UserAvatar fullName={row.user?.full_name} avatarPath={row.user?.avatar_path} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{row.user?.full_name ?? '—'}</p>
            <p className="truncate text-[12px] text-ink-3">{row.user?.email ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'phone',
      header: 'Phone',
      secondary: true,
      cell: (row) => <span className="text-ink-2">{row.user?.phone ?? '—'}</span>,
    },
    {
      id: 'children',
      header: 'Children',
      cell: (row) =>
        row.children.length === 0 ? (
          <Badge variant="warning">None linked</Badge>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.children.map((child) => (
              <Badge key={child.link_id} variant={child.is_primary_contact ? 'brand' : 'neutral'}>
                {child.full_name}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      id: 'status',
      header: 'Account',
      cell: (row) =>
        row.user ? <AccountStatusBadge status={row.user.status} /> : <Badge>Unknown</Badge>,
    },
    {
      id: 'actions',
      header: '',
      className: 'text-right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Manage children for ${row.user?.full_name ?? 'guardian'}`}
            onClick={() => {
              setManagingId(row.id);
            }}
          >
            <Link2 className="size-3.5" aria-hidden />
          </Button>
          {row.user ? (
            <AccountActions
              userId={row.user.id}
              fullName={row.user.full_name}
              email={row.user.email}
              status={row.user.status}
            />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parents"
        description={
          data
            ? `${data.length} guardians on file`
            : 'Guardian accounts and the children they can see.'
        }
        actions={
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add parent
          </Button>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        isLoading={isPending}
        error={error}
        empty={{
          icon: UsersRound,
          title: debounced ? 'No guardians match' : 'No parents yet',
          description: debounced
            ? `Nothing matches “${debounced}”.`
            : 'Add guardians and link them to their children so they can follow their progress.',
          action: (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              Add parent
            </Button>
          ),
        }}
        toolbar={
          <div className="relative max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Search by guardian or child"
              className="pl-10"
              aria-label="Search guardians"
            />
          </div>
        }
      />

      <NewUserDialog open={creating} onOpenChange={setCreating} role="parent" />

      <ManageChildrenDialog
        parent={managing}
        onOpenChange={(open) => {
          if (!open) setManagingId(null);
        }}
      />
    </div>
  );
}

// ── Guardian links ──────────────────────────────────────────────────────────

function ManageChildrenDialog({
  parent,
  onOpenChange,
}: {
  parent: ParentRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { linkChild, unlinkChild } = useParentMutations();
  const students = useStudentOptions(parent !== null);

  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState<GuardianRelationship>('guardian');
  const [unlinking, setUnlinking] = useState<ParentChildRow | null>(null);

  const linked = parent?.children ?? [];
  const alreadyLinked = new Set(linked.map((child) => child.student_id));

  return (
    <>
      <Dialog open={parent !== null} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Children of {parent?.user?.full_name ?? 'this guardian'}</DialogTitle>
            <DialogDescription>
              These links decide what they can see. Removing one takes away their access to that
              child&rsquo;s records immediately.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {linked.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-ink-3">
                No children linked yet. This guardian can sign in but their portal is empty.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {linked.map((child) => (
                  <li key={child.link_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-ink">
                        {child.full_name}
                      </p>
                      <p className="truncate font-mono text-[11.5px] text-ink-3">
                        {child.admission_number}
                      </p>
                    </div>

                    <Badge variant="neutral" className="capitalize">
                      {child.relationship}
                    </Badge>
                    {child.is_primary_contact ? <Badge variant="brand">Primary</Badge> : null}

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Unlink ${child.full_name}`}
                      onClick={() => {
                        setUnlinking(child);
                      }}
                    >
                      <X className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-[13px] font-semibold text-ink-2">Link another child</p>
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[12rem] flex-1">
                  <Select
                    value={studentId}
                    onChange={(event) => {
                      setStudentId(event.target.value);
                    }}
                    disabled={students.isPending}
                    placeholder={students.isPending ? 'Loading students…' : 'Choose a student'}
                    options={(students.data ?? []).map((option) => ({
                      value: option.id,
                      label: `${option.label} · ${option.admissionNumber}`,
                      disabled: alreadyLinked.has(option.id),
                    }))}
                    aria-label="Student to link"
                  />
                </div>

                <Select
                  value={relationship}
                  onChange={(event) => {
                    setRelationship(event.target.value as GuardianRelationship);
                  }}
                  options={RELATIONSHIPS}
                  className="w-auto"
                  aria-label="Relationship"
                />

                <Button
                  variant="secondary"
                  disabled={!studentId}
                  loading={linkChild.isPending}
                  onClick={() => {
                    if (!parent || !studentId) return;
                    linkChild.mutate(
                      {
                        parentId: parent.id,
                        studentId,
                        relationship,
                        // Never claimed automatically here: the child may
                        // already have a primary contact, and
                        // `parent_students_one_primary_per_student` would
                        // reject the insert outright.
                        isPrimaryContact: false,
                      },
                      {
                        onSuccess: () => {
                          setStudentId('');
                        },
                      },
                    );
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Link
                </Button>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={unlinking !== null}
        onOpenChange={(open) => {
          if (!open) setUnlinking(null);
        }}
        title={`Unlink ${unlinking?.full_name ?? 'this child'}?`}
        description="The guardian loses access to this child's results, grades and timetable. Nothing belonging to the child is affected."
        confirmLabel="Unlink child"
        destructive
        isPending={unlinkChild.isPending}
        onConfirm={() => {
          if (!unlinking) return;
          unlinkChild.mutate(unlinking.link_id, {
            onSuccess: () => {
              setUnlinking(null);
            },
          });
        }}
      />
    </>
  );
}
