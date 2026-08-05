import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  Library,
  Megaphone,
  PencilLine,
  Plus,
  Users,
} from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { listAnnouncements } from '@/features/announcements';
import { listAssignments } from '@/features/assignments';
import { currentSlot } from '@/features/timetable';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { TERM_LABEL } from '@/shared/lib/constants';
import { queryKeys } from '@/shared/lib/query-keys';
import { cn } from '@/shared/utils/cn';
import {
  className as formatClassName,
  formatDueIn,
  formatRelative,
  formatTime,
  greeting,
  truncate,
} from '@/shared/utils/format';

import { StatTile } from '../components/stat-tile';
import { useMarkingQueue, useMyTimetable, useTeacherWorkload } from '../hooks/use-teacher-data';
import { useTeacherScope } from '../hooks/use-teacher-scope';

/**
 * The teacher's landing screen.
 *
 * Ordered by what a teacher actually does when they sit down: what am I
 * teaching in the next hour, what is waiting for me to mark, what falls due
 * soon, what has the school said. The shortcut grid that used to be the whole
 * page is at the bottom — navigation matters less than the state of the day.
 *
 * Every panel loads and fails on its own. A teacher with no announcements
 * still gets their timetable, and a failed marking-queue query does not take
 * the page down with it.
 */

function isoWeekday(date = new Date()): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export default function TeacherDashboard() {
  const { user, school, currentSession, teacherId } = useCurrentUser();
  const scope = useTeacherScope();
  const workload = useTeacherWorkload();
  const timetable = useMyTimetable();
  const marking = useMarkingQueue({ limit: 6 });

  // Work falling due in the next fortnight. RLS confines this to the classes
  // the caller teaches, so no class filter is needed on top.
  const upcoming = useQuery({
    queryKey: queryKeys.assignments.list({ teacher: teacherId, view: 'due-soon' }),
    queryFn: () =>
      listAssignments({
        sessionId: scope.sessionId ?? undefined,
        status: 'published',
        dueAfter: new Date().toISOString(),
        dueBefore: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        limit: 5,
      }),
    enabled: Boolean(scope.sessionId),
    staleTime: 60_000,
  });

  const announcements = useQuery({
    queryKey: queryKeys.announcements.list({ view: 'teacher-dashboard' }),
    queryFn: () => listAnnouncements({ limit: 4 }),
    staleTime: 2 * 60_000,
  });

  const today = useMemo(() => {
    const day = isoWeekday();
    return (timetable.data ?? [])
      .filter((slot) => slot.day_of_week === day)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [timetable.data]);

  const now = currentSlot(timetable.data ?? []);

  return (
    <div className="space-y-7">
      <PageHeader
        title={`${greeting()}, ${user.last_name}`}
        description={
          currentSession
            ? `${school?.name ?? 'Your school'} · ${currentSession.name} · ${TERM_LABEL[currentSession.term]}`
            : school?.name
        }
        actions={<Badge variant="brand">Teacher</Badge>}
      />

      {scope.isUnassigned ? (
        <EmptyState
          icon={Users}
          title="No classes assigned yet"
          description="An administrator has not put you against any class or subject for this term. Once they do, your classes, lessons and marking queue appear here."
        />
      ) : null}

      {/* ── The numbers ────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Users}
          label="Classes"
          value={scope.classes.length}
          hint="assigned this term"
          to="/teacher/classes"
          isLoading={scope.isPending}
        />
        <StatTile
          icon={BookOpen}
          label="Subjects"
          value={scope.subjects.length}
          hint="you teach"
          to="/teacher/subjects"
          isLoading={scope.isPending}
        />
        <StatTile
          icon={ClipboardList}
          label="To mark"
          value={workload.data?.pendingSubmissions}
          hint="submissions handed in"
          to="/teacher/grading"
          isLoading={workload.isPending}
          tone="attention"
        />
        <StatTile
          icon={ClipboardCheck}
          label="Quizzes to review"
          value={workload.data?.attemptsAwaitingReview}
          hint="attempts needing a human"
          to="/teacher/quizzes"
          isLoading={workload.isPending}
          tone="attention"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Today ────────────────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-ink-3" aria-hidden />
              Today
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/teacher/timetable">Full week</Link>
            </Button>
          </CardHeader>

          <CardContent>
            {timetable.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : today.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-3">Nothing timetabled today.</p>
            ) : (
              <ul className="divide-y divide-border">
                {today.map((slot) => {
                  const isNow = now?.id === slot.id;
                  return (
                    <li
                      key={slot.id}
                      className={cn(
                        'flex items-center gap-3 py-2.5 first:pt-0 last:pb-0',
                        isNow && '-mx-2 rounded-lg bg-brand-soft/40 px-2',
                      )}
                    >
                      <span className="w-[104px] shrink-0 font-mono text-[12px] whitespace-nowrap text-ink-3">
                        {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
                      </span>

                      {slot.is_break ? (
                        <span className="text-[13px] font-medium text-ink-3">
                          {slot.label ?? 'Break'}
                        </span>
                      ) : (
                        <>
                          <SubjectBadge
                            code={slot.subject?.code ?? '—'}
                            color={slot.subject?.color ?? '#64748b'}
                            size="sm"
                          />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                            {slot.subject?.name ?? 'Subject'}
                          </span>
                          {slot.room ? (
                            <span className="hidden text-[12px] text-ink-3 sm:inline">
                              {slot.room}
                            </span>
                          ) : null}
                        </>
                      )}

                      {isNow ? <Badge variant="brand">Now</Badge> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Marking queue ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PencilLine className="size-4 text-ink-3" aria-hidden />
              Waiting to be marked
            </CardTitle>
          </CardHeader>

          <CardContent>
            {marking.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (marking.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-3">
                Nothing outstanding. You are up to date.
              </p>
            ) : (
              <ul className="space-y-1">
                {(marking.data ?? []).map((row) => (
                  <li key={row.id} className="min-w-0">
                    <Link
                      to={`/teacher/grading?submission=${row.id}`}
                      className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
                    >
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {row.student?.full_name ?? 'Unnamed student'}
                      </span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {truncate(row.assignment?.title ?? 'Assignment', 42)}
                      </span>
                      <span className="block pt-0.5 text-[11.5px] text-ink-3">
                        {row.is_late ? (
                          <span className="font-semibold text-warning">Late · </span>
                        ) : null}
                        {formatRelative(row.submitted_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Due soon ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-4 text-ink-3" aria-hidden />
              Due soon
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/teacher/assignments">All</Link>
            </Button>
          </CardHeader>

          <CardContent>
            {upcoming.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (upcoming.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-3">
                Nothing falls due in the next fortnight.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(upcoming.data ?? []).map((assignment) => {
                  const due = formatDueIn(assignment.due_at);
                  return (
                    <li key={assignment.id} className="py-2.5 first:pt-0 last:pb-0">
                      <Link
                        to={`/teacher/assignments/${assignment.id}`}
                        className="flex items-center gap-3"
                      >
                        <SubjectBadge
                          code={assignment.subject?.code ?? '—'}
                          color={assignment.subject?.color ?? '#64748b'}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-ink">
                            {assignment.title}
                          </span>
                          <span className="block truncate text-[12px] text-ink-3">
                            {assignment.class
                              ? formatClassName(assignment.class.name, assignment.class.arm)
                              : '—'}
                          </span>
                        </span>
                        <Badge variant={due.tone === 'urgent' ? 'warning' : 'neutral'}>
                          {due.label}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Noticeboard ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="size-4 text-ink-3" aria-hidden />
              Announcements
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/teacher/announcements">All</Link>
            </Button>
          </CardHeader>

          <CardContent>
            {announcements.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (announcements.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-3">Nothing posted yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(announcements.data ?? []).map((item) => (
                  <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">
                          {item.title}
                        </span>
                        <span className="block truncate text-[12px] text-ink-3">
                          {truncate(item.body, 70)}
                        </span>
                      </span>
                      {item.priority === 'normal' ? null : (
                        <Badge variant={item.priority === 'urgent' ? 'danger' : 'warning'}>
                          {item.priority}
                        </Badge>
                      )}
                    </div>
                    <p className="pt-0.5 text-[11.5px] text-ink-3">
                      {formatRelative(item.publish_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick actions ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/teacher/lessons?new=1">
              <Plus className="size-4" aria-hidden />
              New lesson
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/teacher/assignments?new=1">
              <ClipboardList className="size-4" aria-hidden />
              Set an assignment
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/teacher/quizzes?new=1">
              <ClipboardCheck className="size-4" aria-hidden />
              Build a quiz
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/teacher/grading">
              <FileSpreadsheet className="size-4" aria-hidden />
              Marking queue
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/teacher/announcements?new=1">
              <Megaphone className="size-4" aria-hidden />
              Post a notice
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/teacher/lessons">
              <Library className="size-4" aria-hidden />
              Lesson library
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
