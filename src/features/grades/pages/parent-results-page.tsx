import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { ChildSwitcher } from '@/features/parent';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/utils/cn';
import { bandForPercentage, formatDate, formatPercent } from '@/shared/utils/format';

import { computeReport, DEFAULT_WEIGHTING } from '../api/grades.service';
import { useStudentGrades } from '../hooks/use-gradebook';

/**
 * A child's results, as their guardian sees them.
 *
 * Published marks only — and that is `grades_select_authorised` doing it, not a
 * filter here. `listStudentGrades` defaults to published, but a guardian asking
 * for everything would still get only what the policy allows; the default just
 * keeps the request honest about what it wants.
 *
 * Grouped by subject with the CA/exam split, because that is the shape of the
 * report card a parent already knows. A flat reverse-chronological list of
 * marks is what a *pupil* wants ("what did I get for that test") and not what a
 * parent does ("how is she doing in maths").
 */
export default function ParentResultsPage() {
  const { children, currentSession, school } = useCurrentUser();
  const [studentId, setStudentId] = useState('');

  useEffect(() => {
    setStudentId((current) => current || (children[0]?.student_id ?? ''));
  }, [children]);

  const child = children.find((entry) => entry.student_id === studentId) ?? children[0];

  const grades = useStudentGrades(child?.student_id, {
    sessionId: currentSession?.id,
  });

  const scale = school?.grading_scale ?? [];

  /** One block per subject, with the split the report card uses. */
  const bySubject = useMemo(() => {
    const rows = grades.data ?? [];
    type Subject = NonNullable<(typeof rows)[number]['subject']>;
    const buckets = new Map<string, { subject: Subject; grades: typeof rows }>();

    for (const grade of rows) {
      if (!grade.subject) continue;
      const bucket = buckets.get(grade.subject.id) ?? { subject: grade.subject, grades: [] };
      bucket.grades.push(grade);
      buckets.set(grade.subject.id, bucket);
    }

    return [...buckets.values()]
      .map((bucket) => ({
        subject: bucket.subject,
        grades: bucket.grades,
        report: computeReport(bucket.grades, DEFAULT_WEIGHTING),
      }))
      .sort((a, b) => a.subject.name.localeCompare(b.subject.name));
  }, [grades.data]);

  const overall = useMemo(() => {
    const values = bySubject
      .map((entry) => entry.report.overallPercentage)
      .filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }, [bySubject]);

  if (children.length === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="No children linked yet"
        description="Ask the school office to link your account to your child's record."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        description={
          currentSession
            ? `${currentSession.name} · ${currentSession.term} term`
            : 'Published results.'
        }
        actions={
          overall !== null ? (
            <Badge variant="brand">Average {formatPercent(overall, 1)}</Badge>
          ) : null
        }
      />

      <ChildSwitcher children={children} value={child?.student_id ?? ''} onChange={setStudentId} />

      {grades.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      ) : bySubject.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Nothing published yet"
          description={`No results have been released for ${child?.full_name ?? 'your child'} this term. The school publishes them once marking is complete.`}
        />
      ) : (
        <div className="space-y-3">
          {bySubject.map((entry) => {
            const band =
              entry.report.overallPercentage === null
                ? undefined
                : bandForPercentage(entry.report.overallPercentage, scale);

            return (
              <Card key={entry.subject.id}>
                <CardHeader className="flex-row items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2.5">
                    <SubjectBadge
                      code={entry.subject.code}
                      color={entry.subject.color ?? '#64748b'}
                      size="sm"
                    />
                    {entry.subject.name}
                  </CardTitle>

                  <div className="flex items-center gap-2">
                    {band ? <Badge variant="neutral">{band.grade}</Badge> : null}
                    <span
                      className={cn(
                        'text-sm font-extrabold',
                        entry.report.overallPercentage === null
                          ? 'text-ink-3'
                          : entry.report.overallPercentage < 40
                            ? 'text-danger'
                            : 'text-ink',
                      )}
                    >
                      {entry.report.overallPercentage === null
                        ? '—'
                        : formatPercent(entry.report.overallPercentage, 1)}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-ink-3">
                    <span>
                      Continuous assessment:{' '}
                      <strong className="text-ink-2">
                        {entry.report.caPercentage === null
                          ? '—'
                          : formatPercent(entry.report.caPercentage, 1)}
                      </strong>{' '}
                      ({entry.report.caCount} {entry.report.caCount === 1 ? 'mark' : 'marks'})
                    </span>
                    <span>
                      Exam:{' '}
                      <strong className="text-ink-2">
                        {entry.report.examPercentage === null
                          ? '—'
                          : formatPercent(entry.report.examPercentage, 1)}
                      </strong>
                    </span>
                  </div>

                  <ul className="divide-y divide-border">
                    {entry.grades.map((grade) => (
                      <li key={grade.id} className="flex items-center gap-3 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                          {grade.title ?? grade.assessment_type}
                        </span>
                        <span className="text-[11.5px] text-ink-3">
                          {formatDate(grade.recorded_at)}
                        </span>
                        <span className="w-20 text-right text-[13px] font-semibold text-ink">
                          {grade.score} / {grade.max_score}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}

          <p className="text-[12.5px] text-ink-3">
            Only results the school has published appear here. If something is missing, marking may
            still be under way — the school releases each subject when it is ready.
          </p>
        </div>
      )}
    </div>
  );
}
