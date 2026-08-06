import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Clock, Lock } from 'lucide-react';

import { useStudentContext } from '@/features/student';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { queryKeys } from '@/shared/lib/query-keys';
import { formatPercent, formatRelative } from '@/shared/utils/format';
import type { Quiz, QuizAttempt } from '@/shared/types';

import { listQuizzes } from '../api/quizzes.service';
import { supabase } from '@/shared/lib/supabase';
import { toAppError } from '@/shared/lib/errors';

/**
 * The papers a pupil can sit, has sat, or is waiting on.
 *
 * Split by what they can *do* rather than by date: open now, not open yet, and
 * done. A list sorted purely by time buries the one paper that closes this
 * afternoon underneath three that open next week.
 */

async function listMyAttemptsForClass(studentId: string): Promise<QuizAttempt[]> {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('student_id', studentId)
    .order('attempt_number', { ascending: false });

  if (error) throw toAppError(error);
  return data;
}

function windowState(quiz: Quiz): 'open' | 'upcoming' | 'closed' {
  const now = Date.now();
  if (quiz.status !== 'published') return 'closed';
  if (quiz.opens_at && new Date(quiz.opens_at).getTime() > now) return 'upcoming';
  if (quiz.closes_at && new Date(quiz.closes_at).getTime() < now) return 'closed';
  return 'open';
}

export default function StudentQuizzesPage() {
  const { classId, sessionId, studentId } = useStudentContext();

  const quizzes = useQuery({
    queryKey: queryKeys.quizzes.list({ classId, sessionId, view: 'student' }),
    queryFn: () =>
      listQuizzes({
        classId: classId ?? undefined,
        sessionId: sessionId ?? undefined,
        status: 'published',
      }),
    enabled: Boolean(classId),
    staleTime: 60_000,
  });

  const attempts = useQuery({
    queryKey: queryKeys.quizzes.myAttempt('all'),
    queryFn: () => listMyAttemptsForClass(studentId!),
    enabled: Boolean(studentId),
    staleTime: 30_000,
  });

  const latestFor = (quizId: string) =>
    (attempts.data ?? []).find((attempt) => attempt.quiz_id === quizId);

  const rows = quizzes.data ?? [];
  const open = rows.filter((quiz) => windowState(quiz) === 'open');
  const upcoming = rows.filter((quiz) => windowState(quiz) === 'upcoming');
  const done = rows.filter((quiz) => windowState(quiz) === 'closed');

  const isPending = quizzes.isPending || attempts.isPending;

  return (
    <div className="space-y-7">
      <PageHeader title="Tests & quizzes" description="Papers set for your class this term." />

      {isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing set yet"
          description="Tests your teachers publish for your class appear here."
        />
      ) : (
        <>
          <Section
            title="Open now"
            quizzes={open}
            latestFor={latestFor}
            emptyLabel="Nothing open."
          />
          {upcoming.length > 0 ? (
            <Section title="Coming up" quizzes={upcoming} latestFor={latestFor} />
          ) : null}
          {done.length > 0 ? (
            <Section title="Finished" quizzes={done} latestFor={latestFor} />
          ) : null}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  quizzes,
  latestFor,
  emptyLabel,
}: {
  title: string;
  quizzes: Quiz[];
  latestFor: (quizId: string) => QuizAttempt | undefined;
  emptyLabel?: string;
}) {
  if (quizzes.length === 0 && !emptyLabel) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-[13px] font-bold tracking-wide text-ink-3 uppercase">{title}</h2>

      {quizzes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-ink-3">
          {emptyLabel}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {quizzes.map((quiz) => {
            const attempt = latestFor(quiz.id);
            const state = windowState(quiz);
            const sat = attempt && attempt.status !== 'in_progress';

            return (
              <Card key={quiz.id} className="transition-colors hover:border-brand-border">
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold text-ink">{quiz.title}</p>
                      <p className="pt-0.5 text-[12.5px] text-ink-3">
                        {quiz.duration_minutes} min · {quiz.total_points} marks
                      </p>
                    </div>

                    {attempt?.status === 'in_progress' ? (
                      <Badge variant="warning">In progress</Badge>
                    ) : sat ? (
                      attempt.percentage !== null && quiz.show_results_immediately ? (
                        <Badge
                          variant={
                            attempt.percentage >= quiz.passing_percentage ? 'success' : 'danger'
                          }
                        >
                          {formatPercent(attempt.percentage, 0)}
                        </Badge>
                      ) : (
                        <Badge variant="neutral">Handed in</Badge>
                      )
                    ) : null}
                  </div>

                  <p className="text-[12.5px] text-ink-3">
                    {state === 'upcoming' ? (
                      <>
                        <Clock className="mr-1 inline size-3" aria-hidden />
                        Opens {formatRelative(quiz.opens_at)}
                      </>
                    ) : state === 'closed' ? (
                      <>
                        <Lock className="mr-1 inline size-3" aria-hidden />
                        Closed
                      </>
                    ) : quiz.closes_at ? (
                      <>Closes {formatRelative(quiz.closes_at)}</>
                    ) : (
                      'No closing time'
                    )}
                  </p>

                  <Button
                    variant={attempt?.status === 'in_progress' ? 'primary' : 'secondary'}
                    size="sm"
                    disabled={state === 'upcoming'}
                    asChild={state !== 'upcoming'}
                  >
                    {state === 'upcoming' ? (
                      <span>Not open yet</span>
                    ) : (
                      <Link to={`/student/quizzes/${quiz.id}`}>
                        {attempt?.status === 'in_progress'
                          ? 'Carry on'
                          : sat
                            ? 'See result'
                            : 'Start'}
                      </Link>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
