import { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/utils/cn';
import { formatDate, formatDueIn } from '@/shared/utils/format';

import { ChildSwitcher } from '../components/child-switcher';
import { useChildDetail, useChildWork } from '../hooks/use-parent';

/**
 * A child's assignments, as their guardian sees them.
 *
 * Read only, and built from the assignments outward — a list assembled from
 * submissions shows what a child handed in, and a guardian is usually here
 * because they want the other list. Work with no submission row is the point of
 * the screen, not an omission from it.
 *
 * No submission contents. A guardian sees that a piece of work was handed in,
 * when, and what it was marked — not the essay itself, which is between the
 * pupil and their teacher unless the pupil chooses otherwise.
 */
export default function ParentAssignmentsPage() {
  const { children } = useCurrentUser();
  const [studentId, setStudentId] = useState('');
  const [filter, setFilter] = useState<'all' | 'outstanding' | 'marked'>('all');

  useEffect(() => {
    setStudentId((current) => current || (children[0]?.student_id ?? ''));
  }, [children]);

  const child = children.find((entry) => entry.student_id === studentId) ?? children[0];
  const detail = useChildDetail(child?.student_id);
  const work = useChildWork(child?.student_id, detail.data?.class?.id ?? null);

  const rows = useMemo(() => {
    const all = work.data ?? [];
    if (filter === 'outstanding') return all.filter((row) => row.status === null);
    if (filter === 'marked') return all.filter((row) => row.score !== null);
    return all;
  }, [work.data, filter]);

  const outstanding = (work.data ?? []).filter((row) => row.status === null).length;

  if (children.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No children linked yet"
        description="Ask the school office to link your account to your child's record."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description="What has been set, what has been handed in, and how it was marked."
        actions={
          outstanding > 0 ? <Badge variant="warning">{outstanding} not handed in</Badge> : null
        }
      />

      <ChildSwitcher children={children} value={child?.student_id ?? ''} onChange={setStudentId} />

      <div className="space-y-1.5">
        <Label htmlFor="pa-filter">Show</Label>
        <Select
          id="pa-filter"
          className="w-48"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value as typeof filter);
          }}
          options={[
            { value: 'all', label: 'Everything' },
            { value: 'outstanding', label: 'Not handed in' },
            { value: 'marked', label: 'Marked' },
          ]}
        />
      </div>

      {detail.isPending || work.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : !detail.data?.class ? (
        <EmptyState
          icon={ClipboardList}
          title="Not in a class yet"
          description={`${child?.full_name ?? 'Your child'} has not been enrolled for this term, so no work has been set for them.`}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filter === 'all' ? 'Nothing set yet' : 'Nothing matches'}
          description={
            filter === 'outstanding'
              ? 'Everything set so far has been handed in.'
              : filter === 'marked'
                ? 'Nothing has been marked yet.'
                : 'No work has been set for this class this term.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const due = formatDueIn(row.due_at);
            const missed = row.status === null && due.tone === 'overdue';

            return (
              <li key={row.id}>
                <Card className={cn(missed && 'border-danger-border')}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-bold text-ink">{row.title}</p>
                      <p className="text-[12.5px] text-ink-3">
                        {row.subject} · due {formatDate(row.due_at)}
                        {row.submitted_at ? ` · handed in ${formatDate(row.submitted_at)}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {row.is_late ? <Badge variant="warning">Late</Badge> : null}

                      {row.status === null ? (
                        <Badge variant={missed ? 'danger' : 'neutral'}>
                          {missed ? 'Not handed in' : 'Not started'}
                        </Badge>
                      ) : row.score !== null ? (
                        <span className="text-sm font-extrabold text-ink">
                          {row.score}
                          <span className="text-[12px] font-normal text-ink-3">
                            {' '}
                            / {row.max_score}
                          </span>
                        </span>
                      ) : (
                        <Badge variant="neutral">Awaiting marking</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
