import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { GraduationCap, Plus, Search } from 'lucide-react';

import { DataTable, type Column } from '@/shared/components/data-table';
import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Select } from '@/shared/components/ui/select';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { PAGE_SIZE } from '@/shared/lib/constants';
import { queryKeys } from '@/shared/lib/query-keys';
import { className as formatClassName, formatDate, formatNumber } from '@/shared/utils/format';
import type { StudentStatus } from '@/shared/types';

import { listStudents, type StudentRow } from '../api/admin.service';
import { AccountActions } from '../components/account-actions';
import { AccountStatusBadge } from '../components/account-status-badge';
import { NewUserDialog } from '../components/new-user-dialog';
import { useClasses } from '../hooks/use-admin-academics';

/**
 * The student register.
 *
 * Paged server-side, unlike the staff and guardian registers: a secondary
 * school has a few dozen teachers and a few hundred parents, but the roll runs
 * to thousands, and `search_students()` exists precisely so a keystroke does
 * not drag the whole thing across the wire.
 *
 * Two status columns, deliberately. `status` is where the pupil stands with the
 * school; the account badge is whether their login works. They usually agree —
 * deactivating an account moves both — but "graduated" and "cannot sign in" are
 * different facts and a school needs to see which is which.
 */

const ENROLMENT_STATUSES: { value: StudentStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'suspended', label: 'Suspended' },
];

export default function AdminStudentsPage() {
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 350);
  const classes = useClasses();

  const filters = {
    search: debouncedSearch,
    classId: classId || undefined,
    status: (status || undefined) as StudentStatus | undefined,
  };

  const query = useQuery({
    queryKey: queryKeys.students.list({ ...filters, page }),
    queryFn: () => listStudents({ ...filters, page, pageSize: PAGE_SIZE }),
    // Keeps the previous page on screen while the next one loads, instead of
    // collapsing the table to a spinner on every keystroke.
    placeholderData: keepPreviousData,
  });

  /** Any filter change invalidates the current page number. */
  const resetTo = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const columns: Column<StudentRow>[] = [
    {
      id: 'student',
      header: 'Student',
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
      id: 'admission_number',
      header: 'Admission no.',
      className: 'font-mono text-[12.5px] whitespace-nowrap',
      cell: (row) => row.admission_number,
    },
    {
      id: 'class',
      header: 'Class',
      cell: (row) => (
        <span className="whitespace-nowrap text-ink-2">
          {row.current_class
            ? formatClassName(row.current_class.name, row.current_class.arm)
            : 'Not enrolled'}
        </span>
      ),
    },
    {
      id: 'admitted',
      header: 'Admitted',
      secondary: true,
      cell: (row) => (
        <span className="whitespace-nowrap text-ink-3">{formatDate(row.admission_date)}</span>
      ),
    },
    {
      id: 'enrolment',
      header: 'Enrolment',
      secondary: true,
      cell: (row) => (
        <Badge variant={row.status === 'active' ? 'success' : 'neutral'} className="capitalize">
          {row.status}
        </Badge>
      ),
    },
    {
      id: 'account',
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

  const isFiltered = debouncedSearch !== '' || classId !== '' || status !== '';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description={
          query.data
            ? `${formatNumber(query.data.total)} students on roll`
            : 'Admissions, enrolment and student records.'
        }
        actions={
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Admit student
          </Button>
        }
      />

      <DataTable
        rows={query.data?.rows ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        isLoading={query.isPending}
        error={query.error}
        empty={{
          icon: GraduationCap,
          title: isFiltered ? 'No students match' : 'No students yet',
          description: isFiltered
            ? 'Nothing matches those filters.'
            : 'Admit your first student to start building the roll.',
          action: isFiltered ? undefined : (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              Admit student
            </Button>
          ),
        }}
        pagination={
          query.data
            ? {
                page: query.data.page,
                pageCount: query.data.pageCount,
                total: query.data.total,
                onPageChange: setPage,
              }
            : undefined
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => {
                  resetTo(() => {
                    setSearch(event.target.value);
                  });
                }}
                placeholder="Search by name, email or admission number"
                className="pl-10"
                aria-label="Search students"
              />
            </div>

            <Select
              value={classId}
              onChange={(event) => {
                resetTo(() => {
                  setClassId(event.target.value);
                });
              }}
              placeholder="All classes"
              className="w-auto"
              aria-label="Filter by class"
              options={[
                { value: '', label: 'All classes' },
                ...(classes.data ?? []).map((row) => ({
                  value: row.id,
                  label: formatClassName(row.name, row.arm),
                })),
              ]}
            />

            <Select
              value={status}
              onChange={(event) => {
                resetTo(() => {
                  setStatus(event.target.value);
                });
              }}
              placeholder="Any enrolment status"
              className="w-auto"
              aria-label="Filter by enrolment status"
              options={[{ value: '', label: 'Any enrolment status' }, ...ENROLMENT_STATUSES]}
            />
          </div>
        }
      />

      <NewUserDialog open={creating} onOpenChange={setCreating} role="student" />
    </div>
  );
}
