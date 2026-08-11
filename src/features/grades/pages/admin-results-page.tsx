import { useMemo, useState } from 'react';
import { BarChart3, Eye, FileSpreadsheet, FileText } from 'lucide-react';

import { useCan, useClasses, useSubjects } from '@/features/admin';
import { useCurrentUser } from '@/features/auth';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/utils/cn';
import { className as formatClassName, formatPercent } from '@/shared/utils/format';

import { useReportCards, useResultPublication, useSchoolResults } from '../hooks/use-gradebook';
import { ReportCards } from '../components/report-cards';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Results, for the office
 * ═══════════════════════════════════════════════════════════════════════════
 *  The same table a teacher edits one class at a time, read whole. Three
 *  questions a per-class gradebook cannot answer: how each year group is doing,
 *  which subjects are carrying the school and which are sinking it, and what is
 *  still unpublished with a fortnight to reports.
 *
 *  Publishing is the consequential act on this page and is treated as one.
 *  `is_published` is what a pupil's `grades_select` policy turns on, so
 *  publishing is not a display setting — it is the moment two thousand families
 *  can see a mark. Both directions are confirmed, and the confirmation says who
 *  gains or loses sight of what rather than asking "are you sure".
 *
 *  Subjects are listed worst average first. An administrator opening this
 *  screen in week ten is looking for the subject in trouble, not the one doing
 *  well, and making them scroll to it is a small daily tax on the one use the
 *  page has.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function AdminResultsPage() {
  const { currentSession, school } = useCurrentUser();
  const canPublish = useCan('results');

  const classes = useClasses();
  const subjects = useSubjects();

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [view, setView] = useState<'analysis' | 'reports'>('analysis');
  const [publishing, setPublishing] = useState<{ ids: string[]; published: boolean } | null>(null);

  const results = useSchoolResults({
    classId: classId || undefined,
    subjectId: subjectId || undefined,
  });
  const reportCards = useReportCards(view === 'reports' && classId ? classId : undefined);
  const { publish } = useResultPublication();

  const data = results.data;
  const classList = useMemo(() => classes.data ?? [], [classes.data]);

  if (!currentSession) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="No current term"
        description="Set a current academic session before looking at results."
      />
    );
  }

  const withheld = (data?.totalGrades ?? 0) - (data?.publishedGrades ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        description={`${currentSession.name} · ${currentSession.term} term, across the whole school.`}
        actions={
          <div className="flex gap-2">
            <Button
              variant={view === 'analysis' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setView('analysis');
              }}
            >
              <BarChart3 className="size-4" aria-hidden />
              Analysis
            </Button>
            <Button
              variant={view === 'reports' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setView('reports');
              }}
            >
              <FileText className="size-4" aria-hidden />
              Report cards
            </Button>
          </div>
        }
      />

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ar-class">Class</Label>
          <Select
            id="ar-class"
            className="w-48"
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
            }}
            placeholder={view === 'reports' ? 'Choose a class' : undefined}
            options={[
              ...(view === 'reports' ? [] : [{ value: '', label: 'Every class' }]),
              ...classList.map((entry) => ({
                value: entry.id,
                label: formatClassName(entry.name, entry.arm),
              })),
            ]}
          />
        </div>

        {view === 'analysis' ? (
          <div className="space-y-1.5">
            <Label htmlFor="ar-subject">Subject</Label>
            <Select
              id="ar-subject"
              className="w-52"
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value);
              }}
              options={[
                { value: '', label: 'Every subject' },
                ...(subjects.data ?? []).map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                })),
              ]}
            />
          </div>
        ) : null}
      </div>

      {view === 'reports' ? (
        classId === '' ? (
          <EmptyState
            icon={FileText}
            title="Choose a class"
            description="Report cards are produced a class at a time."
          />
        ) : (
          <ReportCards
            cards={reportCards.data ?? []}
            isPending={reportCards.isPending}
            schoolName={school?.name ?? 'School'}
            sessionName={`${currentSession.name} · ${currentSession.term} term`}
          />
        )
      ) : results.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (data?.totalGrades ?? 0) === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No results yet"
          description="No marks have been recorded for this term with these filters."
        />
      ) : (
        <>
          {/* ── Publication ────────────────────────────────────────────── */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-ink">
                  {data?.publishedGrades} of {data?.totalGrades} results published
                </p>
                <p className="pt-0.5 text-[12.5px] text-ink-3">
                  {withheld === 0
                    ? 'Everything recorded is visible to pupils and their guardians.'
                    : `${withheld} ${withheld === 1 ? 'mark is' : 'marks are'} recorded but not yet visible to pupils.`}
                </p>
              </div>

              {canPublish ? (
                <div className="flex flex-wrap gap-2">
                  {withheld > 0 ? (
                    <Button
                      onClick={() => {
                        setPublishing({ ids: data?.unpublishedIds ?? [], published: true });
                      }}
                    >
                      <Eye className="size-4" aria-hidden />
                      Publish {withheld}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <Badge variant="warning">Read only</Badge>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* ── Distribution ─────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle>Marks across the school</CardTitle>
              </CardHeader>
              <CardContent>
                <Distribution bands={data?.distribution ?? []} />
                <p className="pt-3 text-[12px] text-ink-3">
                  Every recorded mark, banded by ten. Average{' '}
                  <strong className="text-ink-2">
                    {data?.average === null || data?.average === undefined
                      ? '—'
                      : formatPercent(data.average, 1)}
                  </strong>
                  .
                </p>
              </CardContent>
            </Card>

            {/* ── By class ─────────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle>By class</CardTitle>
              </CardHeader>
              <CardContent>
                {(data?.byClass ?? []).length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-ink-3">Nothing to compare.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {(data?.byClass ?? []).map((row) => (
                      <li key={row.class_id} className="flex items-center gap-3 py-2 first:pt-0">
                        <span className="w-20 text-[13px] font-semibold text-ink">
                          {formatClassName(row.name, row.arm)}
                        </span>
                        <span className="flex-1 text-[12px] text-ink-3">
                          {row.pupils} {row.pupils === 1 ? 'pupil' : 'pupils'} · {row.entered} marks
                          {row.published < row.entered
                            ? ` · ${row.entered - row.published} withheld`
                            : ''}
                        </span>
                        <span
                          className={cn(
                            'text-[13px] font-bold',
                            row.average === null
                              ? 'text-ink-3'
                              : row.average < 40
                                ? 'text-danger'
                                : row.average < 50
                                  ? 'text-warning'
                                  : 'text-ink',
                          )}
                        >
                          {row.average === null ? '—' : formatPercent(row.average, 1)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── By subject ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>By subject</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="pb-3 text-[12.5px] text-ink-3">
                Weakest first — the subject in trouble is the one this page exists to find.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 font-semibold text-ink-3">Subject</th>
                      <th className="py-2 text-right font-semibold text-ink-3">Average</th>
                      <th className="py-2 text-right font-semibold text-ink-3">Below 40</th>
                      <th className="py-2 text-right font-semibold text-ink-3">Marks</th>
                      <th className="py-2 text-right font-semibold text-ink-3">Withheld</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(data?.bySubject ?? []).map((row) => (
                      <tr key={row.subject_id}>
                        <td className="py-2">
                          <span className="font-medium text-ink">{row.name}</span>
                          <span className="pl-1.5 text-[11.5px] text-ink-3">{row.code}</span>
                        </td>
                        <td
                          className={cn(
                            'py-2 text-right font-bold',
                            row.average === null
                              ? 'text-ink-3'
                              : row.average < 40
                                ? 'text-danger'
                                : row.average < 50
                                  ? 'text-warning'
                                  : 'text-ink',
                          )}
                        >
                          {row.average === null ? '—' : formatPercent(row.average, 1)}
                        </td>
                        <td className="py-2 text-right text-ink-2">
                          {row.failing > 0 ? (
                            <span className="text-danger">{row.failing}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 text-right text-ink-3">{row.entered}</td>
                        <td className="py-2 text-right text-ink-3">
                          {row.entered - row.published || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {!canPublish ? (
            <Alert>
              <AlertDescription>
                You can read every result but not publish or withhold one. The founding
                administrator grants that permission.
              </AlertDescription>
            </Alert>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={publishing !== null}
        onOpenChange={(next) => {
          if (!next) setPublishing(null);
        }}
        title={publishing?.published ? 'Publish these results?' : 'Withhold these results?'}
        description={
          publishing?.published
            ? `${publishing.ids.length} marks become visible to the pupils they belong to and to their guardians, immediately. Check them first — withdrawing a published mark is possible, but the family will already have seen it.`
            : `${publishing?.ids.length ?? 0} marks stop being visible to pupils and guardians. Anyone who has already seen them will notice they are gone.`
        }
        confirmLabel={publishing?.published ? 'Publish' : 'Withhold'}
        destructive={!publishing?.published}
        isPending={publish.isPending}
        onConfirm={() => {
          if (publishing) {
            publish.mutate(publishing, {
              onSuccess: () => {
                setPublishing(null);
              },
            });
          }
        }}
      />
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
            className={cn(
              'w-full rounded-t',
              count === 0 ? 'bg-surface-3' : index < 4 ? 'bg-danger/60' : 'bg-brand/70',
            )}
            style={{ height: `${Math.max(4, (count / peak) * 110)}px` }}
          />
          <span className="text-[10px] whitespace-nowrap text-ink-3">{index * 10}</span>
        </div>
      ))}
    </div>
  );
}
