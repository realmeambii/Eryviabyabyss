import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlarmClock, ClipboardCheck, Play, Send } from 'lucide-react';

import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { errorMessage } from '@/shared/lib/errors';
import { cn } from '@/shared/utils/cn';
import { formatDateTime, formatPercent } from '@/shared/utils/format';

import { QuestionPaper } from '../components/question-paper';
import { useQuiz } from '../hooks/use-quizzes';
import {
  useAnswerDraft,
  useCountdown,
  useMyQuizAttempts,
  useQuizPaper,
  useStartAttempt,
  useSubmitAttempt,
} from '../hooks/use-sit-quiz';

/**
 * Sitting a paper.
 *
 * Three states, in order: the pre-flight card, the paper itself, and the
 * result. Which one shows is decided by the attempt, not by local flags — a
 * refresh mid-paper has to land back on the paper with the draft intact, and a
 * candidate who has already handed in must not be able to start again by
 * reloading.
 */
export default function StudentQuizPage() {
  const { quizId } = useParams<{ quizId: string }>();

  const quiz = useQuiz(quizId);
  const attempts = useMyQuizAttempts(quizId);
  const start = useStartAttempt();
  const submit = useSubmitAttempt();

  const open = (attempts.data ?? []).find((attempt) => attempt.status === 'in_progress');
  const finished = (attempts.data ?? []).filter((attempt) => attempt.status !== 'in_progress');
  const latest = finished[0];

  const paper = useQuizPaper(open ? quizId : undefined);
  const { responses, setAnswer, answered } = useAnswerDraft(open?.id);
  const remaining = useCountdown(open?.expires_at);

  const [confirming, setConfirming] = useState(false);
  const autoSubmitted = useRef(false);

  /**
   * Hand in automatically when the clock runs out.
   *
   * A courtesy, not the rule — `submit_quiz_attempt()` records an attempt past
   * its deadline as `expired` whenever it arrives. This just means a candidate
   * who is still typing does not lose what they wrote.
   */
  useEffect(() => {
    if (remaining !== 0 || !open || autoSubmitted.current || submit.isPending) return;
    autoSubmitted.current = true;
    submit.mutate({ attemptId: open.id, responses });
  }, [remaining, open, responses, submit]);

  if (quiz.isPending || attempts.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-96" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (quiz.error || !quiz.data) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Quiz not found"
        description={quiz.error ? errorMessage(quiz.error) : 'It may not be open to your class.'}
        action={
          <Button asChild>
            <Link to="/student/quizzes">Back to quizzes</Link>
          </Button>
        }
      />
    );
  }

  const row = quiz.data;
  const attemptsLeft = row.max_attempts - finished.length;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Tests & quizzes' }, { label: row.title }]}
        title={row.title}
        description={`${row.duration_minutes} minutes · ${row.total_points} marks · pass mark ${row.passing_percentage}%`}
        actions={
          open && remaining !== null ? (
            <Badge variant={remaining < 120 ? 'danger' : remaining < 300 ? 'warning' : 'brand'}>
              <AlarmClock className="size-3" aria-hidden />
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </Badge>
          ) : null
        }
      />

      {/* ── Sitting ────────────────────────────────────────────────────── */}
      {open ? (
        <>
          {remaining !== null && remaining < 120 ? (
            <Alert variant="warning">
              <AlarmClock aria-hidden />
              <AlertTitle>Less than two minutes left</AlertTitle>
              <AlertDescription>
                Your paper is handed in automatically when the clock reaches zero.
              </AlertDescription>
            </Alert>
          ) : null}

          {paper.isPending ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-40 w-full rounded-2xl" />
              ))}
            </div>
          ) : paper.error ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Could not load the paper"
              description={errorMessage(paper.error)}
            />
          ) : (
            <>
              <ol className="space-y-4">
                {(paper.data ?? []).map((question, index) => (
                  <QuestionPaper
                    key={question.id}
                    question={question}
                    index={index}
                    value={responses[question.id] ?? []}
                    onChange={(next) => {
                      setAnswer(question.id, next);
                    }}
                    disabled={submit.isPending}
                  />
                ))}
              </ol>

              <Card className="sticky bottom-4">
                <CardContent className="flex flex-wrap items-center gap-3 py-4">
                  <p className="text-[13.5px] text-ink-2">
                    <strong className="text-ink">{answered}</strong> of {(paper.data ?? []).length}{' '}
                    answered
                  </p>
                  <Button
                    className="ml-auto"
                    loading={submit.isPending}
                    onClick={() => {
                      setConfirming(true);
                    }}
                  >
                    <Send className="size-4" aria-hidden />
                    Hand in
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </>
      ) : latest ? (
        /* ── Result ───────────────────────────────────────────────────── */
        <Card>
          <CardContent className="space-y-4 py-6">
            {latest.status === 'submitted' ? (
              <Alert variant="info">
                <AlertTitle>Handed in — waiting to be marked</AlertTitle>
                <AlertDescription>
                  This paper has written answers, so your teacher marks it by hand. Your result
                  appears here once they have.
                </AlertDescription>
              </Alert>
            ) : !row.show_results_immediately ? (
              <Alert variant="info">
                <AlertTitle>Handed in</AlertTitle>
                <AlertDescription>
                  Your teacher releases results for the whole class together. Check back shortly.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="text-center">
                <p className="text-[12px] font-bold tracking-wide text-ink-3 uppercase">
                  Your result
                </p>
                <p
                  className={cn(
                    'pt-2 text-[44px] leading-none font-extrabold tracking-tight',
                    latest.percentage !== null && latest.percentage >= row.passing_percentage
                      ? 'text-success'
                      : 'text-danger',
                  )}
                >
                  {latest.percentage === null ? '—' : formatPercent(latest.percentage, 0)}
                </p>
                <p className="pt-2 text-[13.5px] text-ink-2">
                  {latest.score} out of {latest.max_score}
                  {latest.status === 'expired' ? ' · handed in after time' : ''}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 border-t border-border pt-4">
              <p className="text-[13px] text-ink-3">
                Attempt {finished.length} of {row.max_attempts}
              </p>
              {attemptsLeft > 0 && row.status === 'published' ? (
                <Button
                  variant="secondary"
                  loading={start.isPending}
                  onClick={() => {
                    if (quizId) start.mutate(quizId);
                  }}
                >
                  <Play className="size-4" aria-hidden />
                  Sit it again
                </Button>
              ) : null}
              <Button variant="ghost" asChild>
                <Link to="/student/quizzes">Back to quizzes</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* ── Pre-flight ───────────────────────────────────────────────── */
        <Card>
          <CardContent className="space-y-4 py-6">
            {row.instructions ? (
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-ink-2">
                {row.instructions}
              </p>
            ) : null}

            <ul className="space-y-1.5 text-[13.5px] text-ink-2">
              <li>
                You have <strong className="text-ink">{row.duration_minutes} minutes</strong> once
                you start. The clock runs on the server, so closing the tab does not pause it.
              </li>
              <li>
                {row.max_attempts === 1
                  ? 'You get one attempt.'
                  : `You get ${row.max_attempts} attempts.`}
              </li>
              {row.closes_at ? <li>Closes {formatDateTime(row.closes_at)}.</li> : null}
              <li>
                Your answers are kept in this browser as you go, so a refresh will not lose them.
              </li>
            </ul>

            {start.error ? (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(start.error)}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              block
              size="lg"
              loading={start.isPending}
              onClick={() => {
                if (quizId) start.mutate(quizId);
              }}
            >
              <Play className="size-4" aria-hidden />
              Start the paper
            </Button>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Hand in your paper?"
        description={
          answered < (paper.data ?? []).length
            ? `You have answered ${answered} of ${(paper.data ?? []).length}. Unanswered questions score nothing, and you cannot come back to this attempt.`
            : 'You cannot come back to this attempt once it is handed in.'
        }
        confirmLabel="Hand in"
        isPending={submit.isPending}
        onConfirm={() => {
          if (!open) return;
          submit.mutate(
            { attemptId: open.id, responses },
            {
              onSuccess: () => {
                setConfirming(false);
              },
            },
          );
        }}
      />
    </div>
  );
}
