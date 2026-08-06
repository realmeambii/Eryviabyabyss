import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BookMarked,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Eye,
  Pencil,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { useTeacherScope } from '@/features/teacher';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { errorMessage } from '@/shared/lib/errors';
import { cn } from '@/shared/utils/cn';
import { className as formatClassName, formatPercent, formatRelative } from '@/shared/utils/format';
import type { QuizQuestion } from '@/shared/types';

import { QuestionBankDialog } from '../components/question-bank-dialog';
import { QuestionEditorDialog } from '../components/question-editor-dialog';
import { QuizEditorDialog } from '../components/quiz-editor-dialog';
import {
  useAttemptBoard,
  useGradeAttempt,
  useQuestionMutations,
  useQuiz,
  useQuizMutations,
  useQuizQuestions,
} from '../hooks/use-quizzes';
import { QUESTION_TYPES, readAnswers, readOptions, usesOptions } from '../lib/question-shapes';

/**
 * The quiz builder, and the board of who has sat it.
 *
 * One page rather than two tabs: a teacher watching a test being sat wants the
 * paper in front of them when a mark looks wrong, and the paper is short.
 */
export default function TeacherQuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const { school } = useCurrentUser();
  const scope = useTeacherScope();

  const quiz = useQuiz(quizId);
  const questions = useQuizQuestions(quizId);
  const { publish, unpublish, release, remove } = useQuizMutations();
  const { remove: removeQuestion, reorder } = useQuestionMutations(quizId);

  const board = useAttemptBoard({
    quizId,
    classId: quiz.data?.class_id,
    sessionId: scope.sessionId,
  });
  const gradeAttempt = useGradeAttempt(quizId);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [deletingQuiz, setDeletingQuiz] = useState(false);
  const [deletingQuestion, setDeletingQuestion] = useState<QuizQuestion | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});

  const rows = useMemo(() => questions.data ?? [], [questions.data]);
  const attempts = board.data ?? [];

  const nextSortOrder = rows.length > 0 ? Math.max(...rows.map((row) => row.sort_order)) + 1 : 1;

  const awaitingReview = attempts.filter((row) => row.attempt?.status === 'submitted');
  const sat = attempts.filter((row) => row.attempt !== null);
  const scored = attempts
    .map((row) => row.attempt?.percentage)
    .filter((value): value is number => value !== null && value !== undefined);
  const average =
    scored.length > 0 ? scored.reduce((sum, value) => sum + value, 0) / scored.length : null;

  if (quiz.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-96" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (quiz.error || !quiz.data) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Quiz not found"
        description={
          quiz.error
            ? errorMessage(quiz.error)
            : 'It may have been deleted, or it belongs to a class you do not teach.'
        }
        action={
          <Button asChild>
            <Link to="/teacher/quizzes">Back to quizzes</Link>
          </Button>
        }
      />
    );
  }

  const row = quiz.data;
  const quizClass = scope.classes.find((entry) => entry.id === row.class_id);
  const subject = scope.subjects.find((entry) => entry.id === row.subject_id);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Quizzes' }, { label: row.title }]}
        title={row.title}
        description={[
          subject?.name,
          quizClass ? formatClassName(quizClass.name, quizClass.arm) : null,
          `${row.duration_minutes} min`,
          `${row.total_points} marks`,
          `pass ${row.passing_percentage}%`,
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
                disabled={rows.length === 0}
                title={rows.length === 0 ? 'Add a question first' : undefined}
                onClick={() => {
                  publish.mutate(row.id);
                }}
              >
                <Eye className="size-4" aria-hidden />
                Publish
              </Button>
            ) : (
              <Button
                variant="secondary"
                loading={unpublish.isPending}
                onClick={() => {
                  unpublish.mutate(row.id);
                }}
              >
                Unpublish
              </Button>
            )}

            {!row.show_results_immediately && sat.length > 0 ? (
              <Button
                variant="secondary"
                loading={release.isPending}
                onClick={() => {
                  release.mutate(row.id);
                }}
              >
                <Send className="size-4" aria-hidden />
                Release results
              </Button>
            ) : null}

            <Button
              variant="secondary"
              onClick={() => {
                setSettingsOpen(true);
              }}
            >
              <Pencil className="size-4" aria-hidden />
              Settings
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete quiz"
              onClick={() => {
                setDeletingQuiz(true);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Questions" value={rows.length} />
        <Stat label="Sat" value={`${sat.length}/${attempts.length}`} />
        <Stat
          label="Awaiting review"
          value={awaitingReview.length}
          tone={awaitingReview.length > 0 ? 'warn' : undefined}
        />
        <Stat label="Average" value={average === null ? '—' : formatPercent(average, 0)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* ── The paper ────────────────────────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>The paper</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setBankOpen(true);
                }}
              >
                <BookMarked className="size-3.5" aria-hidden />
                From bank
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setAddingQuestion(true);
                }}
              >
                <Plus className="size-3.5" aria-hidden />
                Question
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {questions.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-20 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-ink-3">
                No questions yet. Write one, or pull some from the bank.
              </p>
            ) : (
              <ol className="space-y-3">
                {rows.map((question, index) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    index={index}
                    isFirst={index === 0}
                    isLast={index === rows.length - 1}
                    onEdit={() => {
                      setEditingQuestion(question);
                    }}
                    onDelete={() => {
                      setDeletingQuestion(question);
                    }}
                    onMove={(direction) => {
                      const other = rows[index + direction];
                      if (!other) return;
                      reorder.mutate({
                        a: { id: question.id, sort_order: question.sort_order },
                        b: { id: other.id, sort_order: other.sort_order },
                      });
                    }}
                  />
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* ── Who has sat it ───────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Attempts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {board.isPending ? (
              <div className="space-y-2 px-6 pb-6">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : attempts.length === 0 ? (
              <p className="px-6 pb-6 text-center text-[13px] text-ink-3">
                Nobody is enrolled in this class for the current term.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {attempts.map((entry) => {
                  const attempt = entry.attempt;
                  const needsMark = attempt?.status === 'submitted';

                  return (
                    <li key={entry.student_id} className="flex items-center gap-2.5 px-4 py-2.5">
                      <UserAvatar fullName={entry.full_name} avatarPath={entry.avatar_path} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink">
                          {entry.full_name}
                        </p>
                        <p className="truncate text-[11.5px] text-ink-3">
                          {attempt
                            ? formatRelative(attempt.submitted_at ?? attempt.started_at)
                            : 'Not sat'}
                        </p>
                      </div>

                      {!attempt ? (
                        <Badge variant="neutral">—</Badge>
                      ) : needsMark ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={row.total_points}
                            step="0.5"
                            value={marks[attempt.id] ?? attempt.score?.toString() ?? ''}
                            onChange={(event) => {
                              setMarks((current) => ({
                                ...current,
                                [attempt.id]: event.target.value,
                              }));
                            }}
                            className="h-8 w-16"
                            aria-label={`Mark for ${entry.full_name}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Save mark for ${entry.full_name}`}
                            loading={gradeAttempt.isPending}
                            onClick={() => {
                              const value = Number(marks[attempt.id] ?? attempt.score ?? 0);
                              if (!Number.isFinite(value)) return;
                              gradeAttempt.mutate({ attemptId: attempt.id, score: value });
                            }}
                          >
                            <Check className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      ) : (
                        <Badge
                          variant={
                            attempt.percentage === null
                              ? 'neutral'
                              : attempt.percentage >= row.passing_percentage
                                ? 'success'
                                : 'danger'
                          }
                        >
                          {attempt.percentage === null
                            ? attempt.status
                            : `${attempt.score}/${attempt.max_score}`}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      <QuizEditorDialog open={settingsOpen} quiz={row} onOpenChange={setSettingsOpen} />

      {quizId && school ? (
        <>
          <QuestionEditorDialog
            open={addingQuestion || editingQuestion !== null}
            quizId={quizId}
            schoolId={school.id}
            subjectId={row.subject_id}
            question={editingQuestion}
            nextSortOrder={nextSortOrder}
            onOpenChange={(next) => {
              if (next) return;
              setAddingQuestion(false);
              setEditingQuestion(null);
            }}
          />

          <QuestionBankDialog
            open={bankOpen}
            onOpenChange={setBankOpen}
            quizId={quizId}
            schoolId={school.id}
            subjectId={row.subject_id}
            nextSortOrder={nextSortOrder}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={deletingQuiz}
        onOpenChange={setDeletingQuiz}
        title={`Delete “${row.title}”?`}
        description="Every question and every attempt goes with it, including marks already in the gradebook."
        confirmLabel="Delete quiz"
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          remove.mutate(row.id);
        }}
      />

      <ConfirmDialog
        open={deletingQuestion !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingQuestion(null);
        }}
        title="Remove this question?"
        description={
          sat.length > 0
            ? 'Pupils have already sat this paper. Removing a question changes what the marks were out of, and already-recorded results will not be recalculated.'
            : 'It is taken off the paper and the total is recalculated.'
        }
        confirmLabel="Remove question"
        destructive
        isPending={removeQuestion.isPending}
        onConfirm={() => {
          if (!deletingQuestion) return;
          removeQuestion.mutate(deletingQuestion.id, {
            onSuccess: () => {
              setDeletingQuestion(null);
            },
          });
        }}
      />
    </div>
  );
}

// ── Question card ───────────────────────────────────────────────────────────

function QuestionCard({
  question,
  index,
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onMove,
}: {
  question: QuizQuestion;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const options = readOptions(question.options);
  const answers = readAnswers(question.correct_answers);
  const typeLabel =
    QUESTION_TYPES.find((entry) => entry.value === question.question_type)?.label ??
    question.question_type;

  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-surface-3 font-mono text-[11.5px] font-bold text-ink-2">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-ink">{question.prompt}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{typeLabel}</Badge>
            <Badge variant="neutral">{question.points} marks</Badge>
            {question.question_type === 'essay' ? (
              <Badge variant="warning">You mark this</Badge>
            ) : null}
          </div>

          {/* The answer key, visible because this page is teachers only —
              `quiz_questions_select_staff` never returns it to a pupil. */}
          {usesOptions(question.question_type) && options.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {options.map((option) => {
                const correct =
                  question.question_type === 'matching'
                    ? Boolean(option.match)
                    : answers.includes(option.id);
                return (
                  <li
                    key={option.id}
                    className={cn(
                      'flex items-center gap-1.5 text-[12.5px]',
                      correct ? 'font-semibold text-success' : 'text-ink-3',
                    )}
                  >
                    {correct ? <Check className="size-3" aria-hidden /> : <span className="w-3" />}
                    {option.label}
                    {question.question_type === 'matching' && option.match ? (
                      <span className="text-ink-3"> → {option.match}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : answers.length > 0 ? (
            <p className="mt-2 text-[12.5px] text-ink-3">
              Accepts: <span className="font-semibold text-success">{answers.join(', ')}</span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isFirst}
            aria-label={`Move question ${index + 1} up`}
            onClick={() => {
              onMove(-1);
            }}
          >
            <ChevronUp className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isLast}
            aria-label={`Move question ${index + 1} down`}
            onClick={() => {
              onMove(1);
            }}
          >
            <ChevronDown className="size-3.5" aria-hidden />
          </Button>
        </div>

        <div className="flex shrink-0 flex-col gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit question ${index + 1}`}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove question ${index + 1}`}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'warn' }) {
  return (
    <Card className={cn('p-4', tone === 'warn' && 'border-warning/30 bg-warning-soft/30')}>
      <p className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">{label}</p>
      <p className="pt-1 text-[22px] leading-none font-extrabold tracking-tight text-ink">
        {value}
      </p>
    </Card>
  );
}
