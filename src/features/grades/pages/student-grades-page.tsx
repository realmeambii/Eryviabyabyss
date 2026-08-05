import { useMemo } from 'react';
import { FileSpreadsheet } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { useStudentContext, useStudentGrades } from '@/features/student';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { bandForPercentage, formatPercent } from '@/shared/utils/format';
import type { GradeWithSubject } from '../api/grades.service';

/**
 * The student's gradebook.
 *
 * One row per subject, with continuous assessment split from tests and exams
 * the way a Nigerian report card reads.
 *
 * The letter beside each recorded mark comes from the database — banded by
 * `app.apply_grade_band()` against the school's own scale and frozen on the
 * row, so re-tuning the scale next year cannot rewrite this term's report. The
 * *subject* letter is computed here from the weighted average, and is a
 * projection rather than a published grade; it is labelled as such.
 */

interface SubjectRow {
  subjectId: string;
  name: string;
  code: string;
  color: string;
  continuous: GradeWithSubject[];
  tests: GradeWithSubject[];
  exams: GradeWithSubject[];
  weightedAverage: number | null;
}

const CONTINUOUS = new Set(['homework', 'classwork', 'assignment', 'project']);
const TESTS = new Set(['test', 'quiz']);

function averageOf(grades: GradeWithSubject[]): number | null {
  if (grades.length === 0) return null;
  const total = grades.reduce((sum, g) => sum + Number(g.percentage), 0);
  return Math.round((total / grades.length) * 10) / 10;
}

export default function StudentGradesPage() {
  const { school, currentSession } = useCurrentUser();
  const { isUnenrolled, isLoading: contextLoading } = useStudentContext();
  const { data, isPending, isError, error } = useStudentGrades();

  const rows = useMemo<SubjectRow[]>(() => {
    const bySubject = new Map<string, SubjectRow>();

    for (const grade of data ?? []) {
      const subject = grade.subject;
      if (!subject) continue;

      let row = bySubject.get(subject.id);
      if (!row) {
        row = {
          subjectId: subject.id,
          name: subject.name,
          code: subject.code,
          color: subject.color,
          continuous: [],
          tests: [],
          exams: [],
          weightedAverage: null,
        };
        bySubject.set(subject.id, row);
      }

      if (CONTINUOUS.has(grade.assessment_type)) row.continuous.push(grade);
      else if (TESTS.has(grade.assessment_type)) row.tests.push(grade);
      else row.exams.push(grade);
    }

    for (const row of bySubject.values()) {
      const all = [...row.continuous, ...row.tests, ...row.exams];
      const totalWeight = all.reduce((sum, g) => sum + Number(g.weight), 0);
      row.weightedAverage =
        totalWeight > 0
          ? Math.round(
              (all.reduce((sum, g) => sum + Number(g.percentage) * Number(g.weight), 0) /
                totalWeight) *
                10,
            ) / 10
          : averageOf(all);
    }

    return [...bySubject.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const termAverage = useMemo(() => {
    const withAverage = rows.filter((r) => r.weightedAverage !== null);
    if (withAverage.length === 0) return null;
    return (
      Math.round(
        (withAverage.reduce((sum, r) => sum + r.weightedAverage!, 0) / withAverage.length) * 10,
      ) / 10
    );
  }, [rows]);

  const scale = school?.grading_scale ?? [];
  const loading = contextLoading || isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gradebook"
        description={
          currentSession
            ? `${currentSession.name} · ${currentSession.term} term`
            : 'Your results this term.'
        }
        actions={
          termAverage !== null ? (
            <div className="text-right">
              <p className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                Term average
              </p>
              <p className="text-2xl leading-none font-extrabold tracking-tight text-ink">
                {formatPercent(termAverage)}
              </p>
            </div>
          ) : null
        }
      />

      {isUnenrolled ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="You are not in a class yet"
          description="Results appear once you are placed in a class and your teachers publish marks."
        />
      ) : null}

      {isError ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Could not load your results"
          description={error.message}
        />
      ) : null}

      {loading && !isUnenrolled ? <Skeleton className="h-64 w-full rounded-xl" /> : null}

      {!loading && rows.length === 0 && !isUnenrolled ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No results published yet"
          description="Marks appear here as your teachers publish them. Nothing has been released for this term."
        />
      ) : null}

      {!loading && rows.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Subject', 'Continuous', 'Tests', 'Exam', 'Average', 'Grade'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-3 text-left text-[10.5px] font-bold tracking-wider text-ink-3 uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const band =
                    row.weightedAverage !== null
                      ? bandForPercentage(row.weightedAverage, scale)
                      : undefined;

                  return (
                    <tr key={row.subjectId} className="transition-colors hover:bg-surface-2/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <SubjectBadge code={row.code} color={row.color} size="sm" />
                          <span className="font-semibold text-ink">{row.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        {formatPercent(averageOf(row.continuous))}
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        {formatPercent(averageOf(row.tests))}
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        {formatPercent(averageOf(row.exams))}
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink">
                        {formatPercent(row.weightedAverage)}
                      </td>
                      <td className="px-4 py-3">
                        {band ? (
                          <Badge
                            variant={
                              row.weightedAverage! >= 50
                                ? row.weightedAverage! >= 70
                                  ? 'success'
                                  : 'brand'
                                : 'danger'
                            }
                          >
                            {band.grade}
                          </Badge>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {!loading && rows.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 px-5 py-4">
            <p className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
              How this is worked out
            </p>
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              Each subject average is weighted by how much each assessment counts towards the term.
              The grade shown is a projection from marks published so far — your final report may
              differ once every assessment is in.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
