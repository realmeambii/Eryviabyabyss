import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CheckCheck,
  ClipboardList,
  Download,
  Eye,
  Paperclip,
  Pencil,
  Save,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { useTeacherScope } from '@/features/teacher';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { RichText } from '@/shared/components/rich-text';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Textarea } from '@/shared/components/ui/textarea';
import { UPLOAD_LIMITS } from '@/shared/lib/constants';
import { errorMessage } from '@/shared/lib/errors';
import { cn } from '@/shared/utils/cn';
import {
  className as formatClassName,
  formatDateTime,
  formatFileSize,
  formatPercent,
  formatRelative,
} from '@/shared/utils/format';
import type { Json, RubricCriterion } from '@/shared/types';

import {
  analyseSubmissions,
  assignmentFileUrl,
  type AssignmentAttachment,
  type SubmissionRow,
} from '../api/assignments.service';
import { AssignmentEditorDialog } from '../components/assignment-editor-dialog';
import {
  useAssignment,
  useAssignmentAttachmentMutations,
  useAssignmentAttachments,
  useAssignmentMutations,
  useGrading,
  useSubmissionBoard,
} from '../hooks/use-assignments';

/**
 * One assignment: the brief, who has handed in, and the marking.
 *
 * The marking table is the reason this page exists, so it is built for a
 * teacher working down a class with a keyboard. Scores are held in local state
 * until saved, which is what makes bulk grading possible — a mark typed into
 * row four must not fire a request before the teacher has finished row five.
 */

function readRubric(value: Json | null): RubricCriterion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
    const row = entry as Record<string, Json | undefined>;
    if (typeof row.criterion !== 'string') return [];
    return [
      {
        id: typeof row.id === 'string' ? row.id : row.criterion,
        criterion: row.criterion,
        points: typeof row.points === 'number' ? row.points : 0,
        descriptor: typeof row.descriptor === 'string' ? row.descriptor : '',
      },
    ];
  });
}

interface Entry {
  score: string;
  feedback: string;
}

export default function TeacherAssignmentPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { school, user } = useCurrentUser();
  const scope = useTeacherScope();

  const assignment = useAssignment(assignmentId);
  const attachments = useAssignmentAttachments(assignmentId);
  const { publish, remove } = useAssignmentMutations();
  const { attach, remove: removeAttachment } = useAssignmentAttachmentMutations(assignmentId);

  const board = useSubmissionBoard({
    assignmentId,
    classId: assignment.data?.class_id,
    sessionId: scope.sessionId,
  });

  const { grade, bulkGrade, returnToStudent } = useGrading(assignmentId);

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detaching, setDetaching] = useState<AssignmentAttachment | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => board.data ?? [], [board.data]);
  const maxScore = assignment.data?.max_score ?? 0;

  // Seed the inputs from what is already stored, and re-seed when the board
  // refetches. Anything the teacher has typed but not saved wins, so a
  // background refetch mid-marking does not wipe the column.
  useEffect(() => {
    setEntries((current) => {
      const next: Record<string, Entry> = {};
      for (const row of rows) {
        if (!row.submission) continue;
        const existing = current[row.submission.id];
        next[row.submission.id] = existing ?? {
          score: row.submission.score?.toString() ?? '',
          feedback: row.submission.feedback ?? '',
        };
      }
      return next;
    });
  }, [rows]);

  if (assignment.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-96" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (assignment.error || !assignment.data) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Assignment not found"
        description={
          assignment.error
            ? errorMessage(assignment.error)
            : 'It may have been deleted, or it belongs to a class you do not teach.'
        }
        action={
          <Button asChild>
            <Link to="/teacher/assignments">Back to assignments</Link>
          </Button>
        }
      />
    );
  }

  const row = assignment.data;
  const rubric = readRubric(row.rubric);
  const stats = analyseSubmissions(rows, maxScore);

  /** Rows whose typed score differs from what is stored — the bulk save set. */
  const dirty = rows.flatMap((entry) => {
    if (!entry.submission) return [];
    const typed = entries[entry.submission.id];
    if (!typed || typed.score.trim() === '') return [];

    const score = Number(typed.score);
    if (!Number.isFinite(score)) return [];

    const unchanged =
      entry.submission.score === score && (entry.submission.feedback ?? '') === typed.feedback;
    if (unchanged) return [];

    return [{ submissionId: entry.submission.id, score, feedback: typed.feedback || null }];
  });

  const gradedUnreturned = rows.filter((entry) => entry.submission?.status === 'graded');

  const setEntry = (submissionId: string, patch: Partial<Entry>) => {
    setEntries((current) => {
      const existing: Entry = current[submissionId] ?? { score: '', feedback: '' };
      return { ...current, [submissionId]: { ...existing, ...patch } };
    });
  };

  const download = async (file: AssignmentAttachment) => {
    const url = await assignmentFileUrl(file);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Assignments' }, { label: row.title }]}
        title={row.title}
        description={[
          row.subject?.name,
          row.class ? formatClassName(row.class.name, row.class.arm) : null,
          `Out of ${row.max_score}`,
          `Due ${formatDateTime(row.due_at)}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                row.status === 'published'
                  ? 'success'
                  : row.status === 'closed'
                    ? 'warning'
                    : 'neutral'
              }
            >
              {row.status}
            </Badge>
            {row.status === 'draft' ? (
              <Button
                loading={publish.isPending}
                onClick={() => {
                  publish.mutate(row.id);
                }}
              >
                <Eye className="size-4" aria-hidden />
                Publish
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(true);
              }}
            >
              <Pencil className="size-4" aria-hidden />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete assignment"
              onClick={() => {
                setDeleting(true);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        }
      />

      {/* ── Analytics ──────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MiniStat label="On roll" value={stats.onRoll} />
        <MiniStat
          label="Handed in"
          value={`${stats.submitted}/${stats.onRoll}`}
          hint={formatPercent(stats.submissionRate, 0)}
        />
        <MiniStat
          label="Missing"
          value={stats.missing}
          tone={stats.missing > 0 ? 'warn' : undefined}
        />
        <MiniStat label="Late" value={stats.late} />
        <MiniStat
          label="Average"
          value={stats.averageScore === null ? '—' : stats.averageScore.toFixed(1)}
          hint={
            stats.averagePercentage === null ? undefined : formatPercent(stats.averagePercentage, 0)
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* ── Marking board ────────────────────────────────────────── */}
          <Card className="overflow-hidden p-0">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 p-6">
              <CardTitle>Marking</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={dirty.length === 0}
                  loading={bulkGrade.isPending}
                  onClick={() => {
                    bulkGrade.mutate(dirty);
                  }}
                >
                  <Save className="size-3.5" aria-hidden />
                  Save {dirty.length > 0 ? `${dirty.length} ` : ''}
                  {dirty.length === 1 ? 'mark' : 'marks'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={gradedUnreturned.length === 0}
                  loading={returnToStudent.isPending}
                  onClick={() => {
                    // Returned one at a time so a single failure does not
                    // silently strand the rest; each is its own audited write.
                    for (const entry of gradedUnreturned) {
                      if (entry.submission) returnToStudent.mutate(entry.submission.id);
                    }
                  }}
                >
                  <Send className="size-3.5" aria-hidden />
                  Return {gradedUnreturned.length > 0 ? gradedUnreturned.length : ''}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {board.isPending ? (
                <div className="space-y-2 px-6 pb-6">
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} className="h-12 w-full" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Nobody on the roll"
                  description="No pupils are enrolled in this class for the current term."
                  className="m-4 border-0"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Pupil', 'Handed in', `Mark / ${row.max_score}`, 'Feedback', ''].map(
                          (heading) => (
                            <th
                              key={heading}
                              scope="col"
                              className="px-4 py-3 text-left text-[10.5px] font-bold tracking-wider text-ink-3 uppercase"
                            >
                              {heading}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-border">
                      {rows.map((entry) => (
                        <MarkingRow
                          key={entry.student_id}
                          entry={entry}
                          maxScore={maxScore}
                          value={
                            entry.submission
                              ? (entries[entry.submission.id] ?? { score: '', feedback: '' })
                              : { score: '', feedback: '' }
                          }
                          onChange={(patch) => {
                            if (entry.submission) setEntry(entry.submission.id, patch);
                          }}
                          onSaveOne={() => {
                            if (!entry.submission) return;
                            const typed = entries[entry.submission.id];
                            const score = Number(typed?.score);
                            if (!Number.isFinite(score)) return;
                            grade.mutate({
                              submissionId: entry.submission.id,
                              score,
                              feedback: typed?.feedback || null,
                            });
                          }}
                          isSaving={grade.isPending}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Distribution ─────────────────────────────────────────── */}
          {stats.graded + stats.returned > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Mark distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <Distribution bands={stats.distribution} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>The brief</CardTitle>
            </CardHeader>
            <CardContent>
              {row.description ? (
                <p className="mb-3 text-[13.5px] text-ink-2 italic">{row.description}</p>
              ) : null}
              {row.instructions ? (
                <RichText html={row.instructions} />
              ) : (
                <p className="py-4 text-center text-[13px] text-ink-3">No instructions written.</p>
              )}
            </CardContent>
          </Card>

          {rubric.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Rubric</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {rubric.map((criterion) => (
                    <li key={criterion.id} className="flex items-start gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-ink">
                          {criterion.criterion}
                        </span>
                        {criterion.descriptor ? (
                          <span className="block text-[12px] text-ink-3">
                            {criterion.descriptor}
                          </span>
                        ) : null}
                      </span>
                      <Badge variant="neutral">{criterion.points}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {/* ── Brief attachments ────────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="size-4 text-ink-3" aria-hidden />
                Handouts
              </CardTitle>
              <Button
                variant="secondary"
                size="sm"
                loading={attach.isPending}
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="size-3.5" aria-hidden />
                Add
              </Button>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                accept={UPLOAD_LIMITS['assignment-uploads'].accept}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file && assignmentId && school) {
                    attach.mutate({
                      assignmentId,
                      schoolId: school.id,
                      ownerId: user.id,
                      file,
                    });
                  }
                  event.target.value = '';
                }}
              />

              {attachments.isPending ? (
                <Skeleton className="h-10 w-full" />
              ) : (attachments.data ?? []).length === 0 ? (
                <p className="py-4 text-center text-[13px] text-ink-3">No handouts attached.</p>
              ) : (
                <ul className="space-y-1.5">
                  {(attachments.data ?? []).map((file) => (
                    <li
                      key={file.id}
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">
                          {file.original_name}
                        </span>
                        <span className="block text-[11.5px] text-ink-3">
                          {formatFileSize(file.size_bytes)}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Download ${file.original_name}`}
                        onClick={() => {
                          void download(file);
                        }}
                      >
                        <Download className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${file.original_name}`}
                        onClick={() => {
                          setDetaching(file);
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AssignmentEditorDialog open={editing} assignment={row} onOpenChange={setEditing} />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${row.title}”?`}
        description="Every submission and mark against it goes too, including gradebook rows already published to pupils. Closing it instead stops new submissions and keeps the record."
        confirmLabel="Delete assignment"
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          remove.mutate(row.id);
        }}
      />

      <ConfirmDialog
        open={detaching !== null}
        onOpenChange={(next) => {
          if (!next) setDetaching(null);
        }}
        title={`Remove ${detaching?.original_name ?? 'this file'}?`}
        description="Pupils will no longer be able to download it."
        confirmLabel="Remove file"
        destructive
        isPending={removeAttachment.isPending}
        onConfirm={() => {
          if (!detaching) return;
          removeAttachment.mutate(detaching, {
            onSuccess: () => {
              setDetaching(null);
            },
          });
        }}
      />
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

function MarkingRow({
  entry,
  maxScore,
  value,
  onChange,
  onSaveOne,
  isSaving,
}: {
  entry: SubmissionRow;
  maxScore: number;
  value: { score: string; feedback: string };
  onChange: (patch: Partial<{ score: string; feedback: string }>) => void;
  onSaveOne: () => void;
  isSaving: boolean;
}) {
  const submission = entry.submission;
  const handedIn = submission !== null && submission.status !== 'draft';
  const typed = Number(value.score);
  const overMax = value.score.trim() !== '' && Number.isFinite(typed) && typed > maxScore;

  return (
    <tr className={cn('transition-colors', !handedIn && 'opacity-60')}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <UserAvatar fullName={entry.full_name} avatarPath={entry.avatar_path} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{entry.full_name}</p>
            <p className="truncate font-mono text-[11px] text-ink-3">{entry.admission_number}</p>
          </div>
        </div>
      </td>

      <td className="px-4 py-2.5 whitespace-nowrap">
        {!handedIn ? (
          <Badge variant="neutral">Not handed in</Badge>
        ) : (
          <div className="space-y-0.5">
            <p className="text-[12.5px] text-ink-2">{formatRelative(submission.submitted_at)}</p>
            <div className="flex gap-1">
              {submission.is_late ? <Badge variant="warning">Late</Badge> : null}
              {submission.status === 'returned' ? (
                <Badge variant="success">Returned</Badge>
              ) : submission.status === 'graded' ? (
                <Badge variant="info">Marked</Badge>
              ) : null}
            </div>
          </div>
        )}
      </td>

      <td className="px-4 py-2.5">
        <Input
          type="number"
          min={0}
          max={maxScore}
          step="0.5"
          disabled={!handedIn}
          value={value.score}
          onChange={(event) => {
            onChange({ score: event.target.value });
          }}
          onKeyDown={(event) => {
            // Enter saves this one row — the fast path when correcting a single
            // mark without touching the bulk button.
            if (event.key === 'Enter') onSaveOne();
          }}
          aria-label={`Mark for ${entry.full_name}`}
          aria-invalid={overMax}
          className={cn('w-24', overMax && 'border-danger')}
        />
        {overMax ? <p className="pt-1 text-[11px] text-danger">Above {maxScore}</p> : null}
      </td>

      <td className="px-4 py-2.5">
        <Textarea
          rows={1}
          disabled={!handedIn}
          value={value.feedback}
          onChange={(event) => {
            onChange({ feedback: event.target.value });
          }}
          placeholder="Feedback"
          aria-label={`Feedback for ${entry.full_name}`}
          className="min-h-9 resize-y"
        />
      </td>

      <td className="px-4 py-2.5 text-right">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!handedIn || value.score.trim() === '' || overMax}
          loading={isSaving}
          aria-label={`Save mark for ${entry.full_name}`}
          onClick={onSaveOne}
        >
          <CheckCheck className="size-3.5" aria-hidden />
        </Button>
      </td>
    </tr>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

function MiniStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'warn';
}) {
  return (
    <Card className={cn('p-4', tone === 'warn' && 'border-warning/30 bg-warning-soft/30')}>
      <p className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">{label}</p>
      <p className="pt-1 text-[22px] leading-none font-extrabold tracking-tight text-ink">
        {value}
      </p>
      {hint ? <p className="pt-1 text-[11.5px] text-ink-3">{hint}</p> : null}
    </Card>
  );
}

function Distribution({ bands }: { bands: number[] }) {
  const peak = Math.max(1, ...bands);

  return (
    <div className="flex items-end gap-1.5" role="img" aria-label="Distribution of marks by band">
      {bands.map((count, index) => (
        <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[11px] font-semibold text-ink-3">{count || ''}</span>
          <div
            className={cn(
              'w-full rounded-t bg-brand/70',
              // A zero band still gets a sliver so the axis reads as a scale.
              count === 0 && 'bg-surface-3',
            )}
            style={{ height: `${Math.max(4, (count / peak) * 96)}px` }}
          />
          <span className="text-[10px] whitespace-nowrap text-ink-3">{index * 10}</span>
        </div>
      ))}
    </div>
  );
}
