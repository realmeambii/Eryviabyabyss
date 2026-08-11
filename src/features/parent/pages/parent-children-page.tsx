import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  MessagesSquare,
  UsersRound,
} from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/utils/cn';
import { className as formatClassName, formatDate, formatDueIn } from '@/shared/utils/format';

import { ChildSwitcher } from '../components/child-switcher';
import { useChildDetail, useChildQuizzes, useChildWork } from '../hooks/use-parent';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  My children
 * ═══════════════════════════════════════════════════════════════════════════
 *  Everything the school records about one child, on one screen: their class,
 *  who teaches them, what has been set and how it went.
 *
 *  Work is listed from the *assignments* outward rather than from the
 *  submissions, which is the whole point of the page. A list built from
 *  submissions shows what a child has handed in; a guardian opening this is
 *  usually looking for what they have not.
 *
 *  Marks appear only once a teacher has finished with them. A score sitting on
 *  an ungraded submission is a working figure, and a parent who sees it will
 *  treat it as final.
 *
 *  There is no class average anywhere here. A guardian sees their own child;
 *  ranking them against other people's is a comparison the school has not
 *  chosen to publish, and the report card is where a school does that
 *  deliberately.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function ParentChildrenPage() {
  const { children, currentSession } = useCurrentUser();
  const [studentId, setStudentId] = useState('');

  useEffect(() => {
    setStudentId((current) => current || (children[0]?.student_id ?? ''));
  }, [children]);

  const child = children.find((entry) => entry.student_id === studentId) ?? children[0];

  const detail = useChildDetail(child?.student_id);
  const classId = detail.data?.class?.id ?? null;

  const work = useChildWork(child?.student_id, classId);
  const quizzes = useChildQuizzes(child?.student_id, classId);

  const outstanding = useMemo(
    () => (work.data ?? []).filter((row) => row.status === null).length,
    [work.data],
  );

  if (children.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        title="No children linked yet"
        description="Ask the school office to link your account to your child's record. Until then there is nothing for this account to show."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My children"
        description={
          currentSession
            ? `${currentSession.name} · ${currentSession.term} term`
            : 'Everything the school records about each of your children.'
        }
      />

      <ChildSwitcher children={children} value={child?.student_id ?? ''} onChange={setStudentId} />

      {detail.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !detail.data?.class ? (
        <EmptyState
          icon={UsersRound}
          title="Not in a class yet"
          description={`${child?.full_name ?? 'Your child'} has not been enrolled in a class for this term, so there is nothing to show yet.`}
        />
      ) : (
        <>
          {/* ── Class and form teacher ───────────────────────────────────── */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <UserAvatar
                  fullName={child?.full_name ?? ''}
                  avatarPath={child?.avatar_path ?? null}
                  className="size-12"
                />
                <div>
                  <p className="text-sm font-bold text-ink">{child?.full_name}</p>
                  <p className="text-[12.5px] text-ink-3">
                    {formatClassName(detail.data.class.name, detail.data.class.arm)}
                    {detail.data.class.room ? ` · ${detail.data.class.room}` : ''} ·{' '}
                    {child?.admission_number}
                  </p>
                </div>
              </div>

              {detail.data.class.formTeacher ? (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">
                      Form teacher
                    </p>
                    <p className="text-[13.5px] font-semibold text-ink">
                      {detail.data.class.formTeacher.full_name}
                    </p>
                  </div>
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/parent/messages">
                      <MessagesSquare className="size-3.5" aria-hidden />
                      Message
                    </Link>
                  </Button>
                </div>
              ) : (
                <Badge variant="warning">No form teacher yet</Badge>
              )}
            </CardContent>
          </Card>

          {/* ── Shortcuts ────────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Shortcut
              to="/parent/grades"
              icon={FileSpreadsheet}
              title="Results"
              hint="Published marks, subject by subject"
            />
            <Shortcut
              to="/parent/timetable"
              icon={CalendarDays}
              title="Timetable"
              hint="Where they are, and when"
            />
            <Shortcut
              to="/parent/assignments"
              icon={ClipboardList}
              title="Assignments"
              hint={
                outstanding > 0 ? `${outstanding} not handed in` : 'Everything handed in so far'
              }
              tone={outstanding > 0 ? 'attention' : undefined}
            />
          </div>

          {/* ── Who teaches them ─────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4 text-ink-3" aria-hidden />
                Subjects and teachers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detail.data.teachers.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-ink-3">
                  No subjects have been assigned to this class yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {detail.data.teachers.map((entry) => (
                    <li
                      key={`${entry.subject_id}-${entry.teacher_id ?? 'none'}`}
                      className="flex items-center gap-3 py-2 first:pt-0"
                    >
                      <SubjectBadge code={entry.subject_code} color="#64748b" size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                        {entry.subject_name}
                      </span>
                      <span
                        className={cn(
                          'text-[12.5px]',
                          entry.teacher_id ? 'text-ink-2' : 'text-ink-3 italic',
                        )}
                      >
                        {entry.teacher_name}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* ── Recent work ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="size-4 text-ink-3" aria-hidden />
                Assignments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {work.isPending ? (
                <Skeleton className="h-32 w-full" />
              ) : (work.data ?? []).length === 0 ? (
                <p className="py-6 text-center text-[13px] text-ink-3">
                  Nothing has been set for this class yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {(work.data ?? []).slice(0, 8).map((row) => (
                    <WorkRow key={row.id} row={row} />
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
                Tests and quizzes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quizzes.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : (quizzes.data ?? []).length === 0 ? (
                <p className="py-6 text-center text-[13px] text-ink-3">
                  No tests have been set for this class yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {(quizzes.data ?? []).map((row) => (
                    <li key={row.id} className="flex items-center gap-3 py-2 first:pt-0">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">
                          {row.title}
                        </span>
                        <span className="block text-[12px] text-ink-3">{row.subject}</span>
                      </span>

                      {row.attempt === null ? (
                        <Badge variant="neutral">Not sat</Badge>
                      ) : row.attempt.percentage !== null ? (
                        <span className="text-[13px] font-bold text-ink">
                          {row.attempt.score} / {row.total_points ?? '—'}
                        </span>
                      ) : (
                        <Badge variant="warning">Awaiting marking</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function WorkRow({
  row,
}: {
  row: {
    id: string;
    title: string;
    subject: string;
    due_at: string;
    max_score: number;
    status: string | null;
    score: number | null;
    is_late: boolean;
  };
}) {
  const due = formatDueIn(row.due_at);

  return (
    <li className="flex items-center gap-3 py-2 first:pt-0">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">{row.title}</span>
        <span className="block text-[12px] text-ink-3">
          {row.subject} · due {formatDate(row.due_at)}
        </span>
      </span>

      {row.status === null ? (
        <Badge variant={due.tone === 'overdue' ? 'danger' : 'warning'}>
          {due.tone === 'overdue' ? 'Not handed in' : 'Not started'}
        </Badge>
      ) : row.score !== null ? (
        <span className="text-[13px] font-bold text-ink">
          {row.score} / {row.max_score}
        </span>
      ) : (
        <Badge variant="neutral">{row.is_late ? 'Handed in late' : 'Handed in'}</Badge>
      )}
    </li>
  );
}

function Shortcut({
  to,
  icon: Icon,
  title,
  hint,
  tone,
}: {
  to: string;
  icon: typeof BookOpen;
  title: string;
  hint: string;
  tone?: 'attention';
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3.5 transition-colors',
        tone === 'attention'
          ? 'border-warning-border bg-warning-soft hover:bg-warning-soft/70'
          : 'border-border bg-card hover:bg-surface-2',
      )}
    >
      <Icon className="size-5 shrink-0 text-ink-3" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-bold text-ink">{title}</span>
        <span className="block truncate text-[12px] text-ink-3">{hint}</span>
      </span>
    </Link>
  );
}
