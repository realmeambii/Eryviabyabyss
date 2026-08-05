import { useMemo } from 'react';
import { CalendarClock, ClipboardList, FileSpreadsheet, Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useCurrentUser } from '@/features/auth';
import { currentSlot } from '@/features/timetable';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { TERM_LABEL } from '@/shared/lib/constants';
import { formatDueIn, formatPercent, formatTime, greeting } from '@/shared/utils/format';

import { useStudentContext } from '../hooks/use-student-context';
import {
  useStudentAnnouncements,
  useStudentAssignments,
  useStudentGrades,
  useStudentTimetable,
} from '../hooks/use-student-data';

/**
 * The student's landing page.
 *
 * Four questions, in the order a student actually asks them: where am I meant
 * to be, what is due, how am I doing, what has the school said. Everything is
 * live; nothing here is decorative.
 *
 * All four widgets read from the same hooks the full pages use, so opening
 * Assignments after the dashboard is a cache hit rather than a second fetch.
 */
export default function StudentDashboard() {
  const { user, school, currentSession } = useCurrentUser();
  const { className, isUnenrolled } = useStudentContext();

  const { data: timetable } = useStudentTimetable();
  const { data: assignments, isPending: assignmentsPending } = useStudentAssignments();
  const { data: grades } = useStudentGrades();
  const { data: announcements } = useStudentAnnouncements({ limit: 3 });

  const nowSlot = useMemo(() => currentSlot(timetable ?? []), [timetable]);

  const upNext = useMemo(() => {
    const slots = timetable ?? [];
    if (slots.length === 0) return null;

    const now = new Date();
    const isoDay = now.getDay() === 0 ? 7 : now.getDay();
    const minutes = now.getHours() * 60 + now.getMinutes();

    return (
      slots
        .filter((slot) => !slot.is_break && slot.day_of_week === isoDay)
        .find((slot) => {
          const [h = '0', m = '0'] = slot.starts_at.split(':');
          return Number(h) * 60 + Number(m) > minutes;
        }) ?? null
    );
  }, [timetable]);

  const due = useMemo(() => {
    const now = Date.now();
    return (assignments ?? [])
      .filter((a) => new Date(a.due_at).getTime() >= now)
      .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
      .slice(0, 4);
  }, [assignments]);

  const recentGrades = useMemo(
    () =>
      [...(grades ?? [])]
        .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
        .slice(0, 4),
    [grades],
  );

  const average = useMemo(() => {
    if (!grades || grades.length === 0) return null;
    return (
      Math.round((grades.reduce((s, g) => s + Number(g.percentage), 0) / grades.length) * 10) / 10
    );
  }, [grades]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${user.first_name}`}
        description={
          [school?.name, className, currentSession ? TERM_LABEL[currentSession.term] : null]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        actions={
          average !== null ? (
            <div className="text-right">
              <p className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">Average</p>
              <p className="text-xl leading-none font-extrabold tracking-tight text-ink">
                {formatPercent(average)}
              </p>
            </div>
          ) : null
        }
      />

      {isUnenrolled ? (
        <EmptyState
          icon={CalendarClock}
          title="You are not in a class yet"
          description="Your lessons, work and results will appear here once the school office places you in a class."
        />
      ) : null}

      {/* ── Now / up next ─────────────────────────────────────────────── */}
      {nowSlot || upNext ? (
        <Card className={nowSlot ? 'border-brand-border bg-brand-soft' : undefined}>
          <CardContent className="flex items-center gap-4">
            <SubjectBadge
              code={(nowSlot ?? upNext)!.subject?.code ?? '—'}
              color={(nowSlot ?? upNext)!.subject?.color}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                {nowSlot ? 'On now' : 'Up next today'}
              </p>
              <p className="truncate text-lg font-extrabold tracking-tight text-ink">
                {(nowSlot ?? upNext)!.subject?.name ?? 'Lesson'}
              </p>
              <p className="truncate text-[12.5px] text-ink-3">
                {formatTime((nowSlot ?? upNext)!.starts_at)} –{' '}
                {formatTime((nowSlot ?? upNext)!.ends_at)}
                {(nowSlot ?? upNext)!.teacher?.user?.full_name
                  ? ` · ${(nowSlot ?? upNext)!.teacher!.user!.full_name}`
                  : ''}
                {(nowSlot ?? upNext)!.room ? ` · ${(nowSlot ?? upNext)!.room}` : ''}
              </p>
            </div>
            <Link
              to="/student/timetable"
              className="shrink-0 text-[13px] font-semibold text-brand hover:underline"
            >
              Timetable
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Work due ────────────────────────────────────────────────── */}
        <Panel
          title="Work due"
          icon={ClipboardList}
          to="/student/assignments"
          isEmpty={!assignmentsPending && due.length === 0}
          emptyText="Nothing due. You are caught up."
        >
          {assignmentsPending
            ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)
            : due.map((assignment) => {
                const dueIn = formatDueIn(assignment.due_at);
                return (
                  <Link
                    key={assignment.id}
                    to={`/student/assignments/${assignment.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2"
                  >
                    <SubjectBadge
                      code={assignment.subject?.code ?? '—'}
                      color={assignment.subject?.color}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                      {assignment.title}
                    </span>
                    <Badge
                      variant={
                        dueIn.tone === 'urgent'
                          ? 'warning'
                          : dueIn.tone === 'soon'
                            ? 'brand'
                            : 'neutral'
                      }
                    >
                      {dueIn.label}
                    </Badge>
                  </Link>
                );
              })}
        </Panel>

        {/* ── Recent results ──────────────────────────────────────────── */}
        <Panel
          title="Recent results"
          icon={FileSpreadsheet}
          to="/student/grades"
          isEmpty={recentGrades.length === 0}
          emptyText="No marks published yet."
        >
          {recentGrades.map((grade) => (
            <div key={grade.id} className="flex items-center gap-3 px-2 py-2">
              <SubjectBadge
                code={grade.subject?.code ?? '—'}
                color={grade.subject?.color}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                {grade.title}
              </span>
              <Badge variant={Number(grade.percentage) >= 50 ? 'success' : 'danger'}>
                {grade.letter_grade ?? `${grade.percentage}%`}
              </Badge>
            </div>
          ))}
        </Panel>
      </div>

      {/* ── Announcements ─────────────────────────────────────────────── */}
      <Panel
        title="From the school"
        icon={Megaphone}
        to="/student/announcements"
        isEmpty={(announcements?.length ?? 0) === 0}
        emptyText="No notices right now."
      >
        {(announcements ?? []).map((announcement) => (
          <div key={announcement.id} className="space-y-1 px-2 py-2">
            <div className="flex items-center gap-2">
              {announcement.priority !== 'normal' ? (
                <Badge variant={announcement.priority === 'urgent' ? 'danger' : 'warning'}>
                  {announcement.priority}
                </Badge>
              ) : null}
              <p className="truncate text-[13px] font-semibold text-ink">{announcement.title}</p>
            </div>
            <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-3">
              {announcement.body}
            </p>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  to,
  isEmpty,
  emptyText,
  children,
}: {
  title: string;
  icon: typeof ClipboardList;
  to: string;
  isEmpty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 px-3 py-4">
        <div className="flex items-center gap-2 px-2 pb-2">
          <Icon className="size-4 text-ink-3" aria-hidden />
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          <Link to={to} className="ml-auto text-[12.5px] font-semibold text-brand hover:underline">
            View all
          </Link>
        </div>

        {isEmpty ? (
          <p className="px-2 py-4 text-center text-[12.5px] text-ink-3">{emptyText}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
