import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  PencilLine,
  TrendingUp,
  UserMinus,
} from 'lucide-react';

import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { queryKeys } from '@/shared/lib/query-keys';
import { cn } from '@/shared/utils/cn';
import { className as formatClassName, formatPercent } from '@/shared/utils/format';

import { getTeachingAnalytics } from '../api/analytics.service';
import { StatTile } from '../components/stat-tile';
import { useTeacherScope } from '../hooks/use-teacher-scope';

/**
 * How the teaching is going.
 *
 * Every figure is computed from rows RLS has already narrowed to this teacher,
 * so "average" means *their* pupils and not the school's. The subheading says
 * so rather than leaving a teacher to compare themselves against a number whose
 * denominator they cannot see.
 */
export default function TeacherAnalyticsPage() {
  const scope = useTeacherScope();

  const sessionId = scope.sessionId;

  const analytics = useQuery({
    queryKey: queryKeys.teachers.analytics(sessionId, scope.classIds),
    queryFn: () => getTeachingAnalytics({ classIds: scope.classIds, sessionId: sessionId! }),
    enabled: Boolean(sessionId) && !scope.isPending,
    staleTime: 60_000,
  });

  const data = analytics.data;

  if (scope.isUnassigned) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nothing to analyse yet"
        description="You have no classes this term, so there is no work to report on."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Across the classes you teach this term — not the whole school."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={ClipboardList}
          label="Assignments set"
          value={data?.assignmentsSet}
          hint="published this term"
          isLoading={analytics.isPending}
        />
        <StatTile
          icon={TrendingUp}
          label="Handed in"
          value={
            data?.submissionRate === null || data?.submissionRate === undefined
              ? '—'
              : formatPercent(data.submissionRate, 0)
          }
          hint="of expected submissions"
          isLoading={analytics.isPending}
        />
        <StatTile
          icon={PencilLine}
          label="Awaiting marking"
          value={data?.awaitingMarking}
          hint={data?.markedLate ? `${data.markedLate} handed in late` : 'all on time'}
          to="/teacher/grading"
          isLoading={analytics.isPending}
          tone="attention"
        />
        <StatTile
          icon={ClipboardCheck}
          label="Quiz average"
          value={
            data?.quizAverage === null || data?.quizAverage === undefined
              ? '—'
              : formatPercent(data.quizAverage, 0)
          }
          hint={`${data?.quizAttempts ?? 0} papers sat`}
          isLoading={analytics.isPending}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Grade distribution ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4 text-ink-3" aria-hidden />
              Grade distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : (data?.distribution ?? []).every((count) => count === 0) ? (
              <p className="py-10 text-center text-[13px] text-ink-3">No published marks yet.</p>
            ) : (
              <>
                <Distribution bands={data?.distribution ?? []} />
                <p className="pt-3 text-[12px] text-ink-3">
                  Every published mark in your gradebook, banded by ten. Average{' '}
                  <strong className="text-ink-2">
                    {data?.gradeAverage === null || data?.gradeAverage === undefined
                      ? '—'
                      : formatPercent(data.gradeAverage, 1)}
                  </strong>
                  .
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Per class ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>By class</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : (data?.byClass ?? []).length === 0 ? (
              <p className="py-10 text-center text-[13px] text-ink-3">Nothing to compare yet.</p>
            ) : (
              <ul className="space-y-3">
                {(data?.byClass ?? []).map((row) => {
                  const label = scope.classes.find((entry) => entry.id === row.class_id);
                  const rate = row.expected > 0 ? (row.submitted / row.expected) * 100 : null;

                  return (
                    <li key={row.class_id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          to={`/teacher/classes/${row.class_id}`}
                          className="text-[13.5px] font-semibold text-ink hover:text-brand"
                        >
                          {label ? formatClassName(label.name, label.arm) : 'Class'}
                        </Link>
                        <span className="text-[12.5px] text-ink-3">
                          {row.averagePercentage === null
                            ? 'no marks'
                            : formatPercent(row.averagePercentage, 0)}
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            rate === null
                              ? 'bg-surface-3'
                              : rate >= 80
                                ? 'bg-success'
                                : rate >= 50
                                  ? 'bg-brand'
                                  : 'bg-warning',
                          )}
                          style={{ width: `${Math.min(100, rate ?? 0)}%` }}
                        />
                      </div>

                      <p className="text-[11.5px] text-ink-3">
                        {row.expected === 0
                          ? 'Nothing set yet'
                          : `${row.submitted} of ${row.expected} handed in`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Engagement ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserMinus className="size-4 text-ink-3" aria-hidden />
            Pupils with work outstanding
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : (data?.disengaged ?? []).length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-3">
              Everyone is up to date. Nothing outstanding across your classes.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {(data?.disengaged ?? []).map((row) => (
                  <li key={row.student_id} className="flex items-center gap-3 py-2.5 first:pt-0">
                    <Link
                      to={`/teacher/students/${row.student_id}`}
                      className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink hover:text-brand"
                    >
                      {row.full_name}
                    </Link>
                    <Badge variant={row.missing > 2 ? 'danger' : 'warning'}>
                      {row.missing} outstanding
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="pt-3 text-[12px] text-ink-3">
                Counted as work set but not handed in, rather than logins. A pupil who reads every
                lesson and submits nothing is the one worth seeing.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Distribution ────────────────────────────────────────────────────────────

function Distribution({ bands }: { bands: number[] }) {
  const peak = Math.max(1, ...bands);

  return (
    <div className="flex items-end gap-1.5" role="img" aria-label="Marks by ten-percent band">
      {bands.map((count, index) => (
        <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[11px] font-semibold text-ink-3">{count || ''}</span>
          <div
            className={cn('w-full rounded-t', count === 0 ? 'bg-surface-3' : 'bg-brand/70')}
            style={{ height: `${Math.max(4, (count / peak) * 96)}px` }}
          />
          <span className="text-[10px] whitespace-nowrap text-ink-3">{index * 10}</span>
        </div>
      ))}
    </div>
  );
}
