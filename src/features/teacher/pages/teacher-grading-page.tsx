import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCheck, ClipboardCheck, ClipboardList, Clock, FileSpreadsheet } from 'lucide-react';

import { useGrading } from '@/features/assignments';
import { useGradeAttempt } from '@/features/quizzes';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/utils/cn';
import { className as formatClassName, formatRelative } from '@/shared/utils/format';

import { useMarkingQueue, usePendingAttempts } from '../hooks/use-teacher-data';
import { useTeacherScope } from '../hooks/use-teacher-scope';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Marking
 * ═══════════════════════════════════════════════════════════════════════════
 *  Everything waiting on this teacher, across every class and both kinds of
 *  work, oldest first.
 *
 *  The per-assignment board on the assignment page is the right tool when a
 *  teacher sits down to mark one set of papers. This is the other half: the
 *  question "what am I behind on" spans assignments, and answering it by
 *  opening each assignment in turn is how a pupil's work goes unmarked for a
 *  fortnight.
 *
 *  Oldest first, and deliberately not sorted by class or by assignment. A pupil
 *  who handed in on Monday should not wait behind one who handed in this
 *  morning because the list happened to be grouped by subject.
 *
 *  Marks are held locally until saved. Typing a score does not write it —
 *  a teacher scrolling with a trackpad over a number field would otherwise
 *  award marks by accident. `Save all` writes the batch; each row can also be
 *  saved on its own.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Draft {
  score: string;
  feedback: string;
}

export default function TeacherGradingPage() {
  const scope = useTeacherScope();

  /**
   * Two screens link here with a destination in mind, and both were being
   * ignored: the dashboard sends `?submission=` from a specific pupil's row,
   * and a subject page sends `?subject=`. Landing a teacher on an unfiltered
   * queue of forty and letting them hunt is the same as not linking at all.
   */
  const [searchParams] = useSearchParams();
  const focusSubmission = searchParams.get('submission');

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState(() => searchParams.get('subject') ?? '');
  const [kind, setKind] = useState<'all' | 'assignment' | 'quiz'>('all');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const focusRef = useRef<HTMLLIElement | null>(null);

  const filters = useMemo(
    () => ({
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      limit: 100,
    }),
    [classId, subjectId],
  );

  const submissions = useMarkingQueue(filters);
  const attempts = usePendingAttempts(filters);
  const { grade, bulkGrade, returnToStudent } = useGrading(undefined);
  const gradeAttempt = useGradeAttempt(undefined);

  const isPending = submissions.isPending || attempts.isPending;

  /**
   * The two queues interleaved by when the pupil handed in.
   *
   * A quiz sat on Tuesday and an essay handed in on Wednesday belong in that
   * order regardless of which table they came from — sorting by kind first
   * would put a teacher through every essay before the oldest quiz.
   */
  const queue = useMemo(() => {
    const rows: QueueRow[] = [];

    if (kind !== 'quiz') {
      for (const row of submissions.data ?? []) {
        if (!row.assignment) continue;
        rows.push({
          kind: 'assignment',
          id: row.id,
          title: row.assignment.title,
          classId: row.assignment.class_id,
          studentId: row.student?.id ?? null,
          studentName: row.student?.full_name ?? 'Unnamed pupil',
          admissionNumber: row.student?.admission_number ?? '',
          handedIn: row.submitted_at,
          isLate: row.is_late,
          maxScore: row.assignment.max_score,
          currentScore: null,
          href: `/teacher/assignments/${row.assignment.id}`,
        });
      }
    }

    if (kind !== 'assignment') {
      for (const row of attempts.data ?? []) {
        if (!row.quiz) continue;
        rows.push({
          kind: 'quiz',
          id: row.id,
          title: row.quiz.title,
          classId: row.quiz.class_id,
          studentId: row.student?.id ?? null,
          studentName: row.student?.full_name ?? 'Unnamed pupil',
          admissionNumber: row.student?.admission_number ?? '',
          handedIn: row.submitted_at,
          isLate: false,
          maxScore: row.max_score ?? row.quiz.total_points ?? 0,
          currentScore: row.score,
          href: `/teacher/quizzes/${row.quiz.id}`,
        });
      }
    }

    return rows.sort((a, b) => {
      // Nulls last: a row with no hand-in time is a data oddity, not the most
      // urgent thing on the list.
      if (!a.handedIn) return 1;
      if (!b.handedIn) return -1;
      return a.handedIn.localeCompare(b.handedIn);
    });
  }, [submissions.data, attempts.data, kind]);

  // Bring the row the caller asked for into view once it has rendered. Not a
  // filter: the rest of the queue stays visible, because a teacher who came to
  // mark one paper usually marks the next three while they are here.
  useEffect(() => {
    if (!focusSubmission || queue.length === 0) return;
    focusRef.current?.scrollIntoView({ block: 'center' });
  }, [focusSubmission, queue.length]);

  const setDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...{ score: '', feedback: '' }, ...current[id], ...patch },
    }));
  };

  /** Rows with a score typed in that parses and is within range. */
  const ready = useMemo(
    () =>
      queue.filter((row) => {
        const raw = drafts[row.id]?.score;
        if (raw === undefined || raw.trim() === '') return false;
        const value = Number(raw);
        return Number.isFinite(value) && value >= 0 && value <= row.maxScore;
      }),
    [queue, drafts],
  );

  const saveOne = (row: QueueRow) => {
    const draft = drafts[row.id];
    if (!draft) return;
    const score = Number(draft.score);

    if (row.kind === 'assignment') {
      grade.mutate(
        { submissionId: row.id, score, feedback: draft.feedback.trim() || null },
        {
          onSuccess: () => {
            clearDraft(row.id);
          },
        },
      );
    } else {
      gradeAttempt.mutate(
        { attemptId: row.id, score },
        {
          onSuccess: () => {
            clearDraft(row.id);
          },
        },
      );
    }
  };

  const clearDraft = (id: string) => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const saveAll = () => {
    const assignmentEntries = ready
      .filter((row) => row.kind === 'assignment')
      .map((row) => ({
        submissionId: row.id,
        score: Number(drafts[row.id]?.score),
        feedback: drafts[row.id]?.feedback.trim() || null,
      }));

    if (assignmentEntries.length > 0) {
      bulkGrade.mutate(assignmentEntries, {
        onSuccess: () => {
          for (const entry of assignmentEntries) clearDraft(entry.submissionId);
        },
      });
    }

    // Quiz papers go one at a time: there is no bulk path for them, and the
    // per-attempt mutation already reports its own failures.
    for (const row of ready.filter((entry) => entry.kind === 'quiz')) {
      gradeAttempt.mutate(
        { attemptId: row.id, score: Number(drafts[row.id]?.score) },
        {
          onSuccess: () => {
            clearDraft(row.id);
          },
        },
      );
    }
  };

  if (scope.isUnassigned) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="Nothing to mark"
        description="You have no classes this term, so no work is coming to you yet."
      />
    );
  }

  const saving = grade.isPending || bulkGrade.isPending || gradeAttempt.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marking"
        description="Everything waiting on you, across every class, oldest first."
        actions={
          ready.length > 0 ? (
            <Button onClick={saveAll} loading={saving}>
              <CheckCheck className="size-4" aria-hidden />
              Save {ready.length} {ready.length === 1 ? 'mark' : 'marks'}
            </Button>
          ) : null
        }
      />

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="mq-class">Class</Label>
          <Select
            id="mq-class"
            className="w-44"
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
            }}
            options={[
              { value: '', label: 'All classes' },
              ...scope.classes.map((entry) => ({
                value: entry.id,
                label: formatClassName(entry.name, entry.arm),
              })),
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mq-subject">Subject</Label>
          <Select
            id="mq-subject"
            className="w-48"
            value={subjectId}
            onChange={(event) => {
              setSubjectId(event.target.value);
            }}
            options={[
              { value: '', label: 'All subjects' },
              ...scope.subjects.map((entry) => ({ value: entry.id, label: entry.name })),
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mq-kind">Type</Label>
          <Select
            id="mq-kind"
            className="w-40"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as typeof kind);
            }}
            options={[
              { value: 'all', label: 'Everything' },
              { value: 'assignment', label: 'Assignments' },
              { value: 'quiz', label: 'Quiz papers' },
            ]}
          />
        </div>

        <p className="ml-auto text-[13px] text-ink-3">
          {isPending ? 'Loading…' : `${queue.length} waiting`}
        </p>
      </div>

      {/* ── Queue ────────────────────────────────────────────────────────── */}
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : queue.length === 0 ? (
        <EmptyState
          icon={CheckCheck}
          title="Nothing waiting"
          description={
            classId || subjectId || kind !== 'all'
              ? 'Nothing matches these filters. Clear them to see the whole queue.'
              : 'Every submission and quiz paper has been marked. Well done.'
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {queue.map((row) => {
            const draft = drafts[row.id];
            const raw = draft?.score ?? '';
            const value = Number(raw);
            const invalid =
              raw.trim() !== '' && (!Number.isFinite(value) || value < 0 || value > row.maxScore);
            const label = scope.classes.find((entry) => entry.id === row.classId);

            return (
              <li
                key={`${row.kind}-${row.id}`}
                ref={row.id === focusSubmission ? focusRef : undefined}
              >
                <Card
                  className={cn(
                    invalid && 'border-danger',
                    row.id === focusSubmission && 'border-brand-border ring-2 ring-brand/30',
                  )}
                >
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {row.studentId ? (
                            <Link
                              to={`/teacher/students/${row.studentId}`}
                              className="text-sm font-bold text-ink hover:text-brand"
                            >
                              {row.studentName}
                            </Link>
                          ) : (
                            <span className="text-sm font-bold text-ink">{row.studentName}</span>
                          )}
                          {row.admissionNumber ? (
                            <span className="text-[12px] text-ink-3">{row.admissionNumber}</span>
                          ) : null}
                          {row.isLate ? <Badge variant="warning">Late</Badge> : null}
                        </div>

                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
                          {row.kind === 'assignment' ? (
                            <ClipboardList className="size-3.5" aria-hidden />
                          ) : (
                            <ClipboardCheck className="size-3.5" aria-hidden />
                          )}
                          <Link to={row.href} className="hover:text-brand">
                            {row.title}
                          </Link>
                          {label ? <span>· {formatClassName(label.name, label.arm)}</span> : null}
                          {row.handedIn ? (
                            <span className="inline-flex items-center gap-1">
                              · <Clock className="size-3" aria-hidden />
                              {formatRelative(row.handedIn)}
                            </span>
                          ) : null}
                        </p>

                        {row.kind === 'quiz' ? (
                          <p className="mt-1 text-[12px] text-ink-3">
                            Objective questions scored automatically:{' '}
                            <strong className="text-ink-2">
                              {row.currentScore ?? 0} / {row.maxScore}
                            </strong>
                            . Add the marks for the written answers.
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-end gap-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`score-${row.id}`} className="text-[11.5px]">
                            Score / {row.maxScore}
                          </Label>
                          <Input
                            id={`score-${row.id}`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={row.maxScore}
                            step="0.5"
                            value={raw}
                            // A number input responds to the scroll wheel, which
                            // silently changes a mark while a teacher scrolls
                            // the list. Blur on wheel is the standard defence.
                            onWheel={(event) => {
                              event.currentTarget.blur();
                            }}
                            onChange={(event) => {
                              setDraft(row.id, { score: event.target.value });
                            }}
                            aria-invalid={invalid}
                            className="w-24"
                          />
                        </div>

                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={raw.trim() === '' || invalid || saving}
                          onClick={() => {
                            saveOne(row);
                          }}
                        >
                          Save
                        </Button>

                        {row.kind === 'assignment' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              returnToStudent.mutate(row.id);
                            }}
                            disabled={returnToStudent.isPending}
                            title="Hand back without a mark"
                          >
                            Return
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {invalid ? (
                      <p className="text-[12.5px] text-danger">
                        A mark must be between 0 and {row.maxScore}.
                      </p>
                    ) : null}

                    {row.kind === 'assignment' ? (
                      <div className="space-y-1.5">
                        <Label htmlFor={`fb-${row.id}`} className="text-[11.5px]">
                          Feedback (optional)
                        </Label>
                        <Textarea
                          id={`fb-${row.id}`}
                          rows={2}
                          value={draft?.feedback ?? ''}
                          onChange={(event) => {
                            setDraft(row.id, { feedback: event.target.value });
                          }}
                          placeholder="What they did well, and what to work on"
                        />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {queue.length > 0 ? (
        <p className="text-[12.5px] text-ink-3">
          Saving a mark writes the gradebook row through the same update, so results appear in the
          gradebook straight away. Pupils see them once the gradebook is published.
        </p>
      ) : null}
    </div>
  );
}

// ── Row shape ───────────────────────────────────────────────────────────────

interface QueueRow {
  kind: 'assignment' | 'quiz';
  id: string;
  title: string;
  classId: string;
  studentId: string | null;
  studentName: string;
  admissionNumber: string;
  handedIn: string | null;
  isLate: boolean;
  maxScore: number;
  /** Auto-marked total on a quiz paper. Null for assignments. */
  currentScore: number | null;
  href: string;
}
