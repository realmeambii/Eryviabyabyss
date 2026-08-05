import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, GraduationCap, Search } from 'lucide-react';

import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { PAGE_SIZE } from '@/shared/lib/constants';
import { queryKeys } from '@/shared/lib/query-keys';
import { className as formatClassName, formatDate, formatNumber } from '@/shared/utils/format';

import { listStudents } from '../api/admin.service';

/**
 * The student register.
 *
 * A real, paginated table rather than a placeholder — it is the quickest way
 * to prove the whole stack end to end: an administrator sees 200 rows here,
 * and the same query signed in as a teacher returns only their own students,
 * because `students_select_authorised` says so.
 */
export default function AdminStudentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 350);

  const query = useQuery({
    queryKey: queryKeys.students.list({ search: debouncedSearch, page }),
    queryFn: () => listStudents({ search: debouncedSearch, page, pageSize: PAGE_SIZE }),
    // Keeps the previous page on screen while the next one loads, instead of
    // collapsing the table to a spinner on every keystroke.
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description={
          query.data
            ? `${formatNumber(query.data.total)} students on roll`
            : 'Admissions, enrolment and student records.'
        }
      />

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search by name or admission number"
          className="pl-10"
          aria-label="Search students"
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Student', 'Admission no.', 'Class', 'Admitted', 'Status'].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-4 py-3 text-left text-[10.5px] font-bold tracking-wider text-ink-3 uppercase"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {query.isPending
                ? Array.from({ length: 8 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={5} className="px-4 py-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : rows.map((student) => (
                    <tr key={student.id} className="transition-colors hover:bg-surface-2/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            fullName={student.user?.full_name}
                            avatarPath={student.user?.avatar_path}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">
                              {student.user?.full_name ?? '—'}
                            </p>
                            <p className="truncate text-[12px] text-ink-3">
                              {student.user?.email ?? '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[12.5px] whitespace-nowrap text-ink-2">
                        {student.admission_number}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-2">
                        {student.current_class
                          ? formatClassName(student.current_class.name, student.current_class.arm)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-3">
                        {formatDate(student.admission_date)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={student.status === 'active' ? 'success' : 'neutral'}>
                          {student.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!query.isPending && rows.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No students found"
            description={
              debouncedSearch
                ? `Nothing matches “${debouncedSearch}”.`
                : 'No students have been admitted yet.'
            }
            className="m-4 border-0"
          />
        ) : null}
      </Card>

      {query.data && query.data.pageCount > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-ink-3">
            Page {query.data.page} of {query.data.pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= query.data.pageCount}
              onClick={() => {
                setPage((current) => current + 1);
              }}
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
