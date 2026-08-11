import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { formatDate, formatPercent } from '@/shared/utils/format';

import { ChildSwitcher } from '../components/child-switcher';
import { useChildDetail, useChildQuizzes } from '../hooks/use-parent';

/**
 * A child's tests, as their guardian sees them.
 *
 * The result and nothing else — no paper, no questions, no answer key. A quiz a
 * class has not all sat yet is live assessment material, and a guardian holding
 * the questions is the most ordinary way for a test to leak. `get_quiz_paper()`
 * would refuse them anyway; not offering it is the honest version of that.
 *
 * The best attempt is shown where several were allowed, which is what a school
 * records.
 */
export default function ParentQuizzesPage() {
  const { children } = useCurrentUser();
  const [studentId, setStudentId] = useState('');

  useEffect(() => {
    setStudentId((current) => current || (children[0]?.student_id ?? ''));
  }, [children]);

  const child = children.find((entry) => entry.student_id === studentId) ?? children[0];
  const detail = useChildDetail(child?.student_id);
  const quizzes = useChildQuizzes(child?.student_id, detail.data?.class?.id ?? null);

  if (children.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No children linked yet"
        description="Ask the school office to link your account to your child's record."
      />
    );
  }

  const rows = quizzes.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tests & quizzes"
        description="Results only — the papers themselves stay between the school and your child."
      />

      <ChildSwitcher children={children} value={child?.student_id ?? ''} onChange={setStudentId} />

      {detail.isPending || quizzes.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : !detail.data?.class ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Not in a class yet"
          description={`${child?.full_name ?? 'Your child'} has not been enrolled for this term.`}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No tests yet"
          description="No tests have been set for this class this term."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-ink">{row.title}</p>
                    <p className="text-[12.5px] text-ink-3">
                      {row.subject}
                      {row.attempt?.submitted_at
                        ? ` · sat ${formatDate(row.attempt.submitted_at)}`
                        : ''}
                    </p>
                  </div>

                  {row.attempt === null ? (
                    <Badge variant="neutral">Not sat</Badge>
                  ) : row.attempt.percentage !== null ? (
                    <div className="text-right">
                      <p className="text-sm font-extrabold text-ink">
                        {formatPercent(row.attempt.percentage, 0)}
                      </p>
                      <p className="text-[11.5px] text-ink-3">
                        {row.attempt.score} / {row.total_points ?? '—'}
                      </p>
                    </div>
                  ) : (
                    <Badge variant="warning">Awaiting marking</Badge>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
