import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ClipboardList, Paperclip, Upload, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { useMySubmission, useStudentContext } from '@/features/student';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadingBlock } from '@/shared/components/loading-screen';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Separator } from '@/shared/components/ui/separator';
import { UPLOAD_LIMITS } from '@/shared/lib/constants';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatDateTime, formatDueIn, formatFileSize, formatScore } from '@/shared/utils/format';

import { getAssignment } from '../api/assignments.service';
import { useSubmitAssignment } from '../hooks/use-assignment-submission';

/**
 * One assignment: the brief, and the student's own submission.
 *
 * The submission form disappears once the work is graded — at that point the
 * row stops matching `submissions_update_own_draft`, so the database would
 * reject an edit anyway. Hiding the form matches the rule rather than
 * duplicating it.
 */
export default function StudentAssignmentDetailPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { studentId } = useStudentContext();

  const assignmentQuery = useQuery({
    queryKey: queryKeys.assignments.detail(assignmentId ?? 'none'),
    queryFn: () => getAssignment(assignmentId!),
    enabled: Boolean(assignmentId),
  });

  const submissionQuery = useMySubmission(assignmentId);

  if (assignmentQuery.isPending) return <LoadingBlock label="Loading assignment…" />;

  if (assignmentQuery.isError || !assignmentQuery.data) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Assignment not found"
        description="It may have been withdrawn, or it belongs to another class."
        action={
          <Button asChild variant="secondary">
            <Link to="/student/assignments">Back to assignments</Link>
          </Button>
        }
      />
    );
  }

  const assignment = assignmentQuery.data;
  const submission = submissionQuery.data ?? null;
  const due = formatDueIn(assignment.due_at);

  const isGraded = submission?.status === 'graded';
  const isClosed = assignment.closes_at ? new Date(assignment.closes_at) < new Date() : false;
  const canSubmit = !isGraded && !isClosed;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/student/assignments"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink-2"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Assignments
      </Link>

      <div className="flex items-start gap-4">
        <SubjectBadge
          code={assignment.subject?.code ?? '—'}
          color={assignment.subject?.color}
          size="lg"
        />
        <PageHeader
          title={assignment.title}
          description={`${assignment.subject?.name ?? 'Subject'} · out of ${assignment.max_score}`}
          actions={
            <Badge
              variant={
                due.tone === 'overdue' ? 'danger' : due.tone === 'urgent' ? 'warning' : 'neutral'
              }
            >
              {due.label}
            </Badge>
          }
          className="flex-1"
        />
      </div>

      {/* ── Brief ────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4">
          {assignment.description ? (
            <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">
              {assignment.description}
            </p>
          ) : null}

          {assignment.instructions ? (
            <>
              <Separator />
              <div className="space-y-1.5">
                <p className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                  Instructions
                </p>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">
                  {assignment.instructions}
                </p>
              </div>
            </>
          ) : null}

          <Separator />

          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
            {[
              { label: 'Due', value: formatDateTime(assignment.due_at) },
              {
                label: 'Closes',
                value: assignment.closes_at
                  ? formatDateTime(assignment.closes_at)
                  : 'No hard close',
              },
              {
                label: 'Late work',
                value: assignment.allow_late
                  ? `Accepted (−${assignment.late_penalty_percent}%)`
                  : 'Not accepted',
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                  {item.label}
                </dt>
                <dd className="mt-1 text-[13px] font-medium text-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* ── Result, once marked ──────────────────────────────────────── */}
      {isGraded ? (
        <Card className="border-success/30">
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-5 text-success" aria-hidden />
              <p className="text-sm font-bold text-ink">Marked</p>
              <span className="ml-auto text-lg font-extrabold tracking-tight text-ink">
                {formatScore(submission.score, assignment.max_score)}
              </span>
            </div>
            {submission.feedback ? (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <p className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                    Teacher comment
                  </p>
                  <p className="text-[13.5px] leading-relaxed text-ink-2">{submission.feedback}</p>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Submission ───────────────────────────────────────────────── */}
      {canSubmit ? (
        <SubmissionForm
          assignment={assignment}
          studentId={studentId}
          existingContent={submission?.content ?? ''}
          alreadySubmitted={Boolean(submission && submission.status !== 'draft')}
          submittedAt={submission?.submitted_at ?? null}
          isLate={submission?.is_late ?? false}
        />
      ) : null}

      {isClosed && !isGraded ? (
        <Alert variant="warning">
          <AlertDescription>
            The submission window closed on {formatDateTime(assignment.closes_at)}. Speak to your
            teacher if you still need to hand this in.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

// ── Submission form ─────────────────────────────────────────────────────────

function SubmissionForm({
  assignment,
  studentId,
  existingContent,
  alreadySubmitted,
  submittedAt,
  isLate,
}: {
  assignment: { id: string; school_id: string };
  studentId: string | null;
  existingContent: string;
  alreadySubmitted: boolean;
  submittedAt: string | null;
  isLate: boolean;
}) {
  const [content, setContent] = useState(existingContent);
  const [files, setFiles] = useState<File[]>([]);
  const submit = useSubmitAssignment();

  const limits = UPLOAD_LIMITS['assignment-uploads'];

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((current) => [...current, ...Array.from(incoming)]);
  };

  const handleSubmit = (asDraft: boolean) => {
    if (!studentId) return;
    submit.mutate(
      { assignment, studentId, content, files, asDraft },
      {
        onSuccess: () => {
          setFiles([]);
        },
      },
    );
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-ink">Your submission</p>
          {alreadySubmitted ? (
            <Badge variant={isLate ? 'warning' : 'success'}>
              {isLate ? 'Submitted late' : 'Submitted'}
              {submittedAt ? ` · ${formatDateTime(submittedAt)}` : ''}
            </Badge>
          ) : null}
        </div>

        <textarea
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
          }}
          rows={5}
          placeholder="Type your answer, or describe the files you are attaching…"
          className="w-full rounded-lg border border-input bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40"
        />

        {/* ── Attachments ──────────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-5 transition-colors hover:bg-surface-2">
            <Upload className="size-4 text-ink-3" aria-hidden />
            <span className="text-[13px] font-medium text-ink-2">
              Attach a file — up to {formatFileSize(limits.maxBytes)}
            </span>
            <input
              type="file"
              multiple
              accept={limits.accept}
              className="sr-only"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </label>

          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2"
            >
              <Paperclip className="size-3.5 shrink-0 text-ink-3" aria-hidden />
              <span className="truncate text-[13px] font-medium text-ink">{file.name}</span>
              <span className="ml-auto shrink-0 text-[11.5px] text-ink-3">
                {formatFileSize(file.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  setFiles((current) => current.filter((_, i) => i !== index));
                }}
                className="shrink-0 text-ink-3 hover:text-danger"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              handleSubmit(false);
            }}
            loading={submit.isPending}
            disabled={!studentId || (content.trim() === '' && files.length === 0)}
          >
            {alreadySubmitted ? 'Resubmit' : 'Hand in'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              handleSubmit(true);
            }}
            disabled={submit.isPending || !studentId}
          >
            Save draft
          </Button>
        </div>

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          The time your work is received is recorded by the server, not by your device.
        </p>
      </CardContent>
    </Card>
  );
}
