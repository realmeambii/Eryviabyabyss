import { useMemo, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';

import { DataTable, type Column } from '@/shared/components/data-table';
import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { formatDate } from '@/shared/utils/format';

import type { TeacherRow } from '../api/users.service';
import { AccountActions } from '../components/account-actions';
import { AccountStatusBadge } from '../components/account-status-badge';
import { NewUserDialog } from '../components/new-user-dialog';
import { useTeachers } from '../hooks/use-admin-users';

/**
 * The staff register.
 *
 * Filtering happens in the browser rather than in the query: a secondary school
 * has tens of teachers, not thousands, so the whole directory arrives in one
 * request and a keystroke costs nothing. The student register makes the
 * opposite call for the opposite reason.
 */

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  contract: 'Contract',
  visiting: 'Visiting',
};

export default function AdminTeachersPage() {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(search, 250);

  const { data, isPending, error } = useTeachers();

  const rows = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    if (term === '') return data ?? [];

    return (data ?? []).filter((teacher) =>
      [
        teacher.user?.full_name,
        teacher.user?.email,
        teacher.staff_number,
        teacher.specialization,
      ].some((field) => (field ?? '').toLowerCase().includes(term)),
    );
  }, [data, debounced]);

  const columns: Column<TeacherRow>[] = [
    {
      id: 'teacher',
      header: 'Teacher',
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
      id: 'staff_number',
      header: 'Staff no.',
      className: 'font-mono text-[12.5px] whitespace-nowrap',
      cell: (row) => row.staff_number,
    },
    {
      id: 'specialization',
      header: 'Specialisation',
      secondary: true,
      cell: (row) => (
        <span className="text-ink-2">{row.specialization ?? row.qualification ?? '—'}</span>
      ),
    },
    {
      id: 'employment',
      header: 'Employment',
      secondary: true,
      cell: (row) => (
        <div className="space-y-1">
          <Badge variant="neutral">
            {EMPLOYMENT_LABEL[row.employment_type] ?? row.employment_type}
          </Badge>
          <p className="text-[11.5px] text-ink-3">
            {row.hire_date ? `Since ${formatDate(row.hire_date)}` : 'No hire date'}
          </p>
        </div>
      ),
    },
    {
      id: 'load',
      header: 'Teaching',
      secondary: true,
      cell: (row) => (
        <span className="text-ink-2">
          {row.assignment_count === 0
            ? 'Unassigned'
            : `${row.assignment_count} ${row.assignment_count === 1 ? 'pairing' : 'pairings'}`}
        </span>
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
      cell: (row) =>
        row.user ? (
          <div className="flex justify-end">
            <AccountActions
              userId={row.user.id}
              fullName={row.user.full_name}
              email={row.user.email}
              status={row.user.status}
            />
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teachers"
        description={
          data ? `${data.length} on staff` : 'Staff records, sign-ins and teaching assignments.'
        }
        actions={
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add teacher
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
          icon: Users,
          title: debounced ? 'No staff match' : 'No teachers yet',
          description: debounced
            ? `Nothing matches “${debounced}”.`
            : 'Add your teaching staff so they can be assigned to classes and subjects.',
          action: (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              Add teacher
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
              placeholder="Search by name, email or staff number"
              className="pl-10"
              aria-label="Search staff"
            />
          </div>
        }
      />

      <NewUserDialog open={creating} onOpenChange={setCreating} role="teacher" />
    </div>
  );
}
