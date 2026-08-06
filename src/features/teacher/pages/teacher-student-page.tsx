import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  Lock,
  NotebookPen,
  Plus,
  TrendingUp,
  Trash2,
} from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { useStudentGrades } from '@/features/grades';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Textarea } from '@/shared/components/ui/textarea';
import { errorMessage } from '@/shared/lib/errors';
import { cn } from '@/shared/utils/cn';
import {
  className as formatClassName,
  formatDate,
  formatPercent,
  formatRelative,
  truncate,
} from '@/shared/utils/format';

import { summariseProgress, type NoteWithAuthor } from '../api/student-profile.service';
import { StatTile } from '../components/stat-tile';
import {
  useStudentAttemptHistory,
  useStudentNoteMutations,
  useStudentNotes,
  useStudentProfile,
  useStudentSubmissionHistory,
} from '../hooks/use-student-profile';
import { useTeacherScope } from '../hooks/use-teacher-scope';

/**
 * One pupil, from their teacher's side.
 *
 * The administrative record is deliberately absent — no address, no emergency
 * contact, no medical notes. A teacher needs to know how this child is doing in
 * their subject; the pastoral file belongs to the office, and the service layer
 * names its columns so that stays true even though RLS works by row.
 */
export default function TeacherStudentPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { teacherId } = useCurrentUser();
  const scope = useTeacherScope();

  const profile = useStudentProfile(studentId);
  const submissions = useStudentSubmissionHistory(studentId);
  const attempts = useStudentAttemptHistory(studentId);
  const notes = useStudentNotes(studentId);
  const grades = useStudentGrades(studentId, {
    sessionId: scope.sessionId ?? undefined,
    publishedOnly: false,
  });

  const { add, remove } = useStudentNoteMutations(studentId);

  const [noteBody, setNoteBody] = useState('');
  const [notePrivate, setNotePrivate] = useState(false);
  const [noteSubject, setNoteSubject] = useState('');
  const [deletingNote, setDeletingNote] = useState<NoteWithAuthor | null>(null);

  if (profile.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-96" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (profile.error || !profile.data) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Pupil not found"
        description={
          profile.error
            ? errorMessage(profile.error)
            : 'They may not be in any class you teach this term.'
        }
        action={
          <Button asChild>
            <Link to="/teacher/classes">Back to my classes</Link>
          </Button>
        }
      />
    );
  }

  const student = profile.data;
  const progress = summariseProgress(
    submissions.data ?? [],
    attempts.data ?? [],
    grades.data ?? [],
  );

  const subjectName = (subjectId: string | null | undefined) =>
    scope.subjects.find((entry) => entry.id === subjectId)?.name ?? 'Subject';

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'My classes' }, { label: student.full_name }]}
        title={student.full_name}
        description={[
          student.admission_number,
          student.current_class
            ? formatClassName(student.current_class.name, student.current_class.arm)
            : 'Not enrolled',
          `Admitted ${formatDate(student.admission_date)}`,
        ].join(' · ')}
        actions={
          <div className="flex items-center gap-3">
            <Badge variant={student.status === 'active' ? 'success' : 'neutral'}>
              {student.status}
            </Badge>
            <UserAvatar
              fullName={student.full_name}
              avatarPath={student.avatar_path}
              className="size-11"
            />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={ClipboardList}
          label="Handed in"
          value={progress.submitted}
          hint={progress.late > 0 ? `${progress.late} late` : 'on time'}
          isLoading={submissions.isPending}
        />
        <StatTile
          icon={TrendingUp}
          label="Assignment average"
          value={
            progress.averagePercentage === null ? '—' : formatPercent(progress.averagePercentage, 0)
          }
          isLoading={submissions.isPending}
        />
        <StatTile
          icon={ClipboardCheck}
          label="Quizzes sat"
          value={progress.quizzesSat}
          hint={`${progress.quizzesPassed} passed`}
          isLoading={attempts.isPending}
        />
        <StatTile
          icon={FileSpreadsheet}
          label="Marks recorded"
          value={grades.data?.length}
          isLoading={grades.isPending}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Assignments ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-4 text-ink-3" aria-hidden />
              Assignment history
            </CardTitle>
          </CardHeader>
          <CardContent>
            {submissions.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : (submissions.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-3">
                Nothing handed in this term.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(submissions.data ?? []).map((row) => (
                  <li key={row.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {row.assignment?.title ?? 'Assignment'}
                      </span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {subjectName(row.assignment?.subject_id)} ·{' '}
                        {formatRelative(row.submitted_at)}
                      </span>
                    </span>
                    {row.is_late ? <Badge variant="warning">Late</Badge> : null}
                    <Badge
                      variant={
                        row.score === null
                          ? 'neutral'
                          : row.assignment && row.score / row.assignment.max_score >= 0.5
                            ? 'success'
                            : 'danger'
                      }
                    >
                      {row.score === null
                        ? row.status
                        : `${row.score}/${row.assignment?.max_score ?? '?'}`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Quizzes ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-ink-3" aria-hidden />
              Quiz performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attempts.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : (attempts.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-3">No quizzes sat this term.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(attempts.data ?? []).map((row) => (
                  <li key={row.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {row.quiz?.title ?? 'Quiz'}
                      </span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {subjectName(row.quiz?.subject_id)} · {formatRelative(row.submitted_at)}
                      </span>
                    </span>
                    <Badge
                      variant={
                        row.percentage === null
                          ? 'neutral'
                          : row.quiz && row.percentage >= row.quiz.passing_percentage
                            ? 'success'
                            : 'danger'
                      }
                    >
                      {row.percentage === null ? row.status : `${formatPercent(row.percentage, 0)}`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Progress ───────────────────────────────────────────────────── */}
      {progress.trend.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-4 text-ink-3" aria-hidden />
              Published marks over the term
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Trend points={progress.trend} />
          </CardContent>
        </Card>
      ) : null}

      {/* ── Notes ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <NotebookPen className="size-4 text-ink-3" aria-hidden />
            Teacher notes
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-xl border border-border p-3">
            <Textarea
              value={noteBody}
              onChange={(event) => {
                setNoteBody(event.target.value);
              }}
              rows={2}
              placeholder="An observation about this pupil — progress, effort, something to follow up."
              aria-label="New note"
            />

            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={noteSubject}
                onChange={(event) => {
                  setNoteSubject(event.target.value);
                }}
                className="w-auto"
                aria-label="Subject this note is about"
                options={[
                  { value: '', label: 'No subject' },
                  ...scope.subjects.map((subject) => ({
                    value: subject.id,
                    label: subject.name,
                  })),
                ]}
              />

              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
                <input
                  type="checkbox"
                  checked={notePrivate}
                  onChange={(event) => {
                    setNotePrivate(event.target.checked);
                  }}
                  className="size-3.5 accent-brand"
                />
                <Lock className="size-3.5 text-ink-3" aria-hidden />
                Only me
              </label>

              <Button
                size="sm"
                className="ml-auto"
                disabled={noteBody.trim().length === 0}
                loading={add.isPending}
                onClick={() => {
                  add.mutate(
                    {
                      body: noteBody.trim(),
                      isPrivate: notePrivate,
                      subjectId: noteSubject || null,
                    },
                    {
                      onSuccess: () => {
                        setNoteBody('');
                        setNotePrivate(false);
                        setNoteSubject('');
                      },
                    },
                  );
                }}
              >
                <Plus className="size-4" aria-hidden />
                Add note
              </Button>
            </div>

            <p className="text-[11.5px] text-ink-3">
              Notes are never shown to the pupil or their guardians. Unticked, colleagues who also
              teach this pupil can read them; ticked, only you and the school office.
            </p>
          </div>

          {notes.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : (notes.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-[13px] text-ink-3">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {(notes.data ?? []).map((note) => (
                <li key={note.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-[13.5px] text-ink-2">{note.body}</p>
                    {note.teacher_id === teacherId ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete note"
                        onClick={() => {
                          setDeletingNote(note);
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                    <span className="text-[11.5px] text-ink-3">
                      {note.teacher?.user?.full_name ?? 'A teacher'} ·{' '}
                      {formatRelative(note.created_at)}
                    </span>
                    {note.subject ? <Badge variant="outline">{note.subject.code}</Badge> : null}
                    {note.is_private ? (
                      <Badge variant="neutral">
                        <Lock className="size-3" aria-hidden />
                        Private
                      </Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deletingNote !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingNote(null);
        }}
        title="Delete this note?"
        description={
          deletingNote ? `“${truncate(deletingNote.body, 90)}” will be removed permanently.` : ''
        }
        confirmLabel="Delete note"
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deletingNote) return;
          remove.mutate(deletingNote.id, {
            onSuccess: () => {
              setDeletingNote(null);
            },
          });
        }}
      />
    </div>
  );
}

// ── Trend ───────────────────────────────────────────────────────────────────

/**
 * Published marks in the order they were recorded.
 *
 * An inline SVG rather than a charting dependency: it is one polyline, and the
 * alternative is 40kB of library plus a theming layer for a sparkline.
 */
function Trend({ points }: { points: { at: string; percentage: number }[] }) {
  const width = 100;
  const height = 32;

  const path = points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width;
      const y = height - (point.percentage / 100) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const latest = points[points.length - 1]?.percentage ?? 0;
  const first = points[0]?.percentage ?? 0;
  const rising = latest >= first;

  return (
    <div className="flex items-center gap-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-16 flex-1"
        role="img"
        aria-label={`${points.length} published marks, from ${formatPercent(first, 0)} to ${formatPercent(latest, 0)}`}
      >
        <polyline
          points={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          className={cn(rising ? 'text-success' : 'text-warning')}
        />
      </svg>

      <div className="shrink-0 text-right">
        <p className="text-[22px] leading-none font-extrabold tracking-tight text-ink">
          {formatPercent(latest, 0)}
        </p>
        <p className="pt-1 text-[11.5px] text-ink-3">
          {rising ? 'up' : 'down'} from {formatPercent(first, 0)}
        </p>
      </div>
    </div>
  );
}
