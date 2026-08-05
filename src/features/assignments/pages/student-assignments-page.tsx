import { useMemo } from 'react';
import { ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useStudentAssignments, useStudentContext } from '@/features/student';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Card } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { formatDueIn } from '@/shared/utils/format';

import type { AssignmentWithContext } from '../api/assignments.service';

type Bucket = 'overdue' | 'due' | 'later' | 'closed';

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: 'Overdue',
  due: 'Due this week',
  later: 'Later',
  closed: 'Closed',
};

/**
 * The student's work list.
 *
 * Grouped by urgency rather than sorted by date, because "what is overdue" and
 * "what is due this week" are different questions from "what is next", and a
 * flat list makes the first two invisible.
 */
export default function StudentAssignmentsPage() {
  const { isUnenrolled, isLoading: contextLoading } = useStudentContext();
  const { data, isPending, isError, error } = useStudentAssignments();

  const grouped = useMemo(() => {
    const now = Date.now();
    const week = now + 7 * 24 * 60 * 60 * 1000;
    const buckets: Record<Bucket, AssignmentWithContext[]> = {
      overdue: [],
      due: [],
      later: [],
      closed: [],
    };

    for (const assignment of data ?? []) {
      const due = new Date(assignment.due_at).getTime();
      const closed = assignment.closes_at ? new Date(assignment.closes_at).getTime() < now : false;

      if (closed) buckets.closed.push(assignment);
      else if (due < now) buckets.overdue.push(assignment);
      else if (due <= week) buckets.due.push(assignment);
      else buckets.later.push(assignment);
    }

    return buckets;
  }, [data]);

  const loading = contextLoading || isPending;
  const total = data?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description={total > 0 ? `${total} set this term.` : 'Work set by your teachers.'}
      />

      {isUnenrolled ? (
        <EmptyState
          icon={ClipboardList}
          title="You are not in a class yet"
          description="Assignments appear once the school office places you in a class."
        />
      ) : null}

      {isError ? (
        <EmptyState
          icon={ClipboardList}
          title="Could not load assignments"
          description={error.message}
        />
      ) : null}

      {loading && !isUnenrolled ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Card key={index} className="flex items-center gap-4 p-4">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-6 w-24 rounded-md" />
            </Card>
          ))}
        </div>
      ) : null}

      {!loading && total === 0 && !isUnenrolled ? (
        <EmptyState
          icon={ClipboardList}
          title="Nothing set"
          description="You have no assignments this term. Enjoy it while it lasts."
        />
      ) : null}

      {!loading
        ? (['overdue', 'due', 'later', 'closed'] as const).map((bucket) =>
            grouped[bucket].length > 0 ? (
              <section key={bucket} className="space-y-3">
                <h2 className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                  {BUCKET_LABEL[bucket]} · {grouped[bucket].length}
                </h2>
                <Card className="divide-y divide-border overflow-hidden p-0">
                  {grouped[bucket].map((assignment) => (
                    <AssignmentRow key={assignment.id} assignment={assignment} />
                  ))}
                </Card>
              </section>
            ) : null,
          )
        : null}
    </div>
  );
}

function AssignmentRow({ assignment }: { assignment: AssignmentWithContext }) {
  const due = formatDueIn(assignment.due_at);

  return (
    <Link
      to={`/student/assignments/${assignment.id}`}
      className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2/60"
    >
      <SubjectBadge
        code={assignment.subject?.code ?? '—'}
        color={assignment.subject?.color}
        size="md"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{assignment.title}</p>
        <p className="truncate text-[12.5px] text-ink-3">
          {assignment.subject?.name ?? 'Subject'} · out of {assignment.max_score}
        </p>
      </div>

      <Badge
        variant={
          due.tone === 'overdue'
            ? 'danger'
            : due.tone === 'urgent'
              ? 'warning'
              : due.tone === 'soon'
                ? 'brand'
                : 'neutral'
        }
        className="shrink-0"
      >
        {due.label}
      </Badge>
    </Link>
  );
}
