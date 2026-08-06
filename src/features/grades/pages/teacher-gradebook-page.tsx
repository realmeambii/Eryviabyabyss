import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, FileSpreadsheet, Plus, Send, Upload } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { useTeacherScope } from '@/features/teacher';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/utils/cn';
import { className as formatClassName, formatPercent } from '@/shared/utils/format';

import { DEFAULT_WEIGHTING, gradebookToCsv } from '../api/grades.service';
import { GradeEntryDialog } from '../components/grade-entry-dialog';
import { GradeImportDialog } from '../components/grade-import-dialog';
import { useClassGradebook, useGradeMutations } from '../hooks/use-gradebook';

/**
 * The class gradebook for one subject.
 *
 * Continuous assessment and the terminal exam are shown as separate columns
 * before the combined mark, because that is how a Nigerian secondary school
 * reports and how a teacher checks their arithmetic. The weighting is on the
 * page rather than buried in settings — a school that runs 30/70 changes it
 * here and sees the effect immediately.
 */
export default function TeacherGradebookPage() {
  const { school, currentSession } = useCurrentUser();
  const scope = useTeacherScope();
  const [params, setParams] = useSearchParams();

  const classId = params.get('class') ?? '';
  const subjectId = params.get('subject') ?? '';

  const [caWeight, setCaWeight] = useState(DEFAULT_WEIGHTING.caWeight * 100);
  const [entering, setEntering] = useState(false);
  const [importing, setImporting] = useState(false);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const weighting = useMemo(
    () => ({ caWeight: caWeight / 100, examWeight: 1 - caWeight / 100 }),
    [caWeight],
  );

  const gradebook = useClassGradebook({
    classId: classId || undefined,
    subjectId: subjectId || undefined,
    sessionId: scope.sessionId,
    weighting,
  });

  const { setPublished } = useGradeMutations();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const entries = useMemo(() => gradebook.data ?? [], [gradebook.data]);
  const subjectsFor = classId
    ? (scope.classes.find((row) => row.id === classId)?.subjects ?? [])
    : scope.subjects;

  const unpublished = entries.flatMap((entry) =>
    entry.grades.filter((grade) => !grade.is_published).map((grade) => grade.id),
  );

  const classAverage = useMemo(() => {
    const marks = entries
      .map((entry) => entry.report.overallPercentage)
      .filter((value): value is number => value !== null);
    if (marks.length === 0) return null;
    return marks.reduce((sum, value) => sum + value, 0) / marks.length;
  }, [entries]);

  const exportCsv = () => {
    const csv = gradebookToCsv(entries);
    // A data: URL rather than a Blob object URL — nothing to revoke, and the
    // file is a few kilobytes of text.
    const link = downloadRef.current;
    if (!link) return;

    const label = scope.classes.find((row) => row.id === classId);
    const subject = scope.subjects.find((row) => row.id === subjectId);

    link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    link.download = `gradebook-${label ? formatClassName(label.name, label.arm).replace(/\s+/g, '') : 'class'}-${subject?.code ?? ''}.csv`;
    link.click();
  };

  const ready = Boolean(classId && subjectId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gradebook"
        description="Continuous assessment, exams and the combined mark for a class."
        actions={
          ready ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setImporting(true);
                }}
              >
                <Upload className="size-4" aria-hidden />
                Import
              </Button>
              <Button variant="secondary" onClick={exportCsv} disabled={entries.length === 0}>
                <Download className="size-4" aria-hidden />
                Export
              </Button>
              <Button
                onClick={() => {
                  setEntering(true);
                }}
              >
                <Plus className="size-4" aria-hidden />
                Record a mark
              </Button>
            </div>
          ) : null
        }
      />
      {/* Kept out of the flow; `click()` on a real anchor is what makes the
          download work without a popup blocker getting involved. */}
      <a ref={downloadRef} className="hidden" aria-hidden />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="gb-class">Class</Label>
          <Select
            id="gb-class"
            value={classId}
            onChange={(event) => {
              setParam('class', event.target.value);
            }}
            placeholder="Choose a class"
            className="w-auto"
            options={scope.classes.map((row) => ({
              value: row.id,
              label: formatClassName(row.name, row.arm),
            }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gb-subject">Subject</Label>
          <Select
            id="gb-subject"
            value={subjectId}
            onChange={(event) => {
              setParam('subject', event.target.value);
            }}
            disabled={!classId}
            placeholder={classId ? 'Choose a subject' : 'Class first'}
            className="w-auto"
            options={subjectsFor.map((subject) => ({ value: subject.id, label: subject.name }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gb-weight">CA weight (%)</Label>
          <Input
            id="gb-weight"
            type="number"
            min={0}
            max={100}
            value={caWeight}
            onChange={(event) => {
              setCaWeight(Math.min(100, Math.max(0, Number(event.target.value))));
            }}
            className="w-24"
          />
        </div>

        <p className="pb-2 text-[12.5px] text-ink-3">
          CA {caWeight}% · Exam {100 - caWeight}%
        </p>

        {unpublished.length > 0 ? (
          <Button
            variant="secondary"
            className="mb-0.5 ml-auto"
            loading={setPublished.isPending}
            onClick={() => {
              setPublished.mutate({ ids: unpublished, published: true });
            }}
          >
            <Send className="size-4" aria-hidden />
            Publish {unpublished.length} unpublished
          </Button>
        ) : null}
      </div>

      {!ready ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Choose a class and subject"
          description="The gradebook shows one subject at a time, because that is how a term mark is worked out."
        />
      ) : gradebook.isPending ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : gradebook.error ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Could not load the gradebook"
          description={gradebook.error.message}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Nobody enrolled"
          description="No pupils are on this class register for the current term."
        />
      ) : (
        <>
          {classAverage !== null ? (
            <Card className="p-4">
              <p className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">
                Class average
              </p>
              <p className="pt-1 text-[26px] leading-none font-extrabold tracking-tight text-ink">
                {formatPercent(classAverage, 1)}
              </p>
            </Card>
          ) : null}

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Pupil', 'Marks', 'CA', 'Exam', 'Overall', 'Grade'].map((heading) => (
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
                  {entries.map((entry) => {
                    const band = school?.grading_scale.find(
                      (scale) =>
                        entry.report.overallPercentage !== null &&
                        entry.report.overallPercentage >= scale.min &&
                        entry.report.overallPercentage <= scale.max,
                    );

                    return (
                      <tr key={entry.student_id} className="hover:bg-surface-2/60">
                        <td className="px-4 py-2.5">
                          <Link
                            to={`/teacher/students/${entry.student_id}`}
                            className="flex items-center gap-2.5"
                          >
                            <span className="w-6 shrink-0 text-right font-mono text-[11.5px] text-ink-3">
                              {entry.roll_number ?? '—'}
                            </span>
                            <UserAvatar fullName={entry.full_name} avatarPath={entry.avatar_path} />
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-semibold text-ink">
                                {entry.full_name}
                              </span>
                              <span className="block truncate font-mono text-[11px] text-ink-3">
                                {entry.admission_number}
                              </span>
                            </span>
                          </Link>
                        </td>

                        <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">
                          {entry.report.caCount + entry.report.examCount === 0 ? (
                            <span className="text-ink-3">None</span>
                          ) : (
                            <>
                              {entry.report.caCount} CA
                              {entry.report.examCount > 0
                                ? ` · ${entry.report.examCount} exam`
                                : ''}
                            </>
                          )}
                        </td>

                        <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">
                          {entry.report.caPercentage === null
                            ? '—'
                            : formatPercent(entry.report.caPercentage, 1)}
                        </td>

                        <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">
                          {entry.report.examPercentage === null
                            ? '—'
                            : formatPercent(entry.report.examPercentage, 1)}
                        </td>

                        <td
                          className={cn(
                            'px-4 py-2.5 font-bold whitespace-nowrap',
                            entry.report.overallPercentage === null ? 'text-ink-3' : 'text-ink',
                          )}
                        >
                          {entry.report.overallPercentage === null
                            ? '—'
                            : formatPercent(entry.report.overallPercentage, 1)}
                        </td>

                        <td className="px-4 py-2.5">
                          {band ? (
                            <Badge
                              variant={
                                band.grade.startsWith('A') || band.grade.startsWith('B')
                                  ? 'success'
                                  : band.grade.startsWith('F')
                                    ? 'danger'
                                    : 'neutral'
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

          <p className="text-[12px] text-ink-3">
            The letter shown here is banded from the combined mark against your school&rsquo;s
            scale. Each individual mark keeps the letter it was given when it was recorded, so a
            change to the scale never rewrites past results.
          </p>
        </>
      )}

      {ready && school && currentSession ? (
        <>
          <GradeEntryDialog
            open={entering}
            onOpenChange={setEntering}
            classId={classId}
            subjectId={subjectId}
            schoolId={school.id}
            sessionId={currentSession.id}
            roster={entries.map((entry) => ({
              student_id: entry.student_id,
              full_name: entry.full_name,
              admission_number: entry.admission_number,
            }))}
          />

          <GradeImportDialog
            open={importing}
            onOpenChange={setImporting}
            classId={classId}
            subjectId={subjectId}
            schoolId={school.id}
            sessionId={currentSession.id}
            roster={entries.map((entry) => ({
              student_id: entry.student_id,
              admission_number: entry.admission_number,
            }))}
          />
        </>
      ) : null}
    </div>
  );
}
