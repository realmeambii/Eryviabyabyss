import { Link, useParams } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  Library,
  Megaphone,
  TrendingUp,
  Users,
} from 'lucide-react';

import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { className as formatClassName, formatNumber, formatPercent } from '@/shared/utils/format';

import { StatTile } from '../components/stat-tile';
import { useClassRoster, useClassStatistics } from '../hooks/use-teacher-data';
import { useMyClass, useTeacherScope } from '../hooks/use-teacher-scope';

/**
 * A single class, from the teacher's side.
 *
 * The class is resolved from the shared scope rather than fetched by id, which
 * makes "is this class mine?" a lookup instead of a request — and gives an
 * honest 'not assigned' screen rather than an empty one when a teacher follows
 * a stale link to a class they no longer take.
 */
export default function TeacherClassPage() {
  const { classId } = useParams<{ classId: string }>();
  const scope = useTeacherScope();
  const row = useMyClass(classId);
  const roster = useClassRoster(classId);
  const stats = useClassStatistics(classId);

  if (scope.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  if (!row) {
    return (
      <EmptyState
        icon={Users}
        title="Not one of your classes"
        description="This class is not assigned to you this term, so its register and marks are not yours to see."
        action={
          <Button asChild>
            <Link to="/teacher/classes">Back to my classes</Link>
          </Button>
        }
      />
    );
  }

  const label = formatClassName(row.name, row.arm);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'My classes' }, { label }]}
        title={label}
        description={`${row.room ? `Room ${row.room}` : 'No room set'} · capacity ${row.capacity} · ${row.subjects.length} ${row.subjects.length === 1 ? 'subject' : 'subjects'} with you`}
        actions={row.isLead ? <Badge variant="brand">Form teacher</Badge> : null}
      />

      {/* ── Statistics ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={Users}
          label="On roll"
          value={stats.data?.studentCount}
          hint="enrolled this term"
          isLoading={stats.isPending}
        />
        <StatTile
          icon={ClipboardList}
          label="Assignments"
          value={stats.data?.assignmentCount}
          hint="set this term"
          isLoading={stats.isPending}
        />
        <StatTile
          icon={TrendingUp}
          label="Class average"
          value={
            stats.data?.averagePercentage === null || stats.data?.averagePercentage === undefined
              ? '—'
              : formatPercent(stats.data.averagePercentage)
          }
          hint="across published marks"
          isLoading={stats.isPending}
        />
        <StatTile
          icon={FileSpreadsheet}
          label="Handed in"
          value={
            stats.data?.submissionRate === null || stats.data?.submissionRate === undefined
              ? '—'
              : formatPercent(stats.data.submissionRate, 0)
          }
          hint="of expected submissions"
          isLoading={stats.isPending}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Roster ───────────────────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="size-4 text-ink-3" aria-hidden />
              Register
            </CardTitle>
            {roster.data ? (
              <span className="text-[12.5px] text-ink-3">
                {formatNumber(roster.data.length)} pupils
              </span>
            ) : null}
          </CardHeader>

          <CardContent className="p-0">
            {roster.isPending ? (
              <div className="space-y-2 px-6 pb-6">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-11 w-full" />
                ))}
              </div>
            ) : roster.error ? (
              <EmptyState
                icon={Users}
                title="Could not load the register"
                description={roster.error.message}
                className="m-4 border-0"
              />
            ) : (roster.data ?? []).length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nobody enrolled yet"
                description="An administrator enrols pupils into this class."
                className="m-4 border-0"
              />
            ) : (
              <ul className="divide-y divide-border">
                {(roster.data ?? []).map((student) => (
                  <li key={student.student_id}>
                    <Link
                      to={`/teacher/students/${student.student_id}`}
                      className="flex items-center gap-3 px-6 py-2.5 transition-colors hover:bg-surface-2/60"
                    >
                      <span className="w-7 shrink-0 text-right font-mono text-[12px] text-ink-3">
                        {student.roll_number ?? '—'}
                      </span>
                      <UserAvatar fullName={student.full_name} avatarPath={student.avatar_path} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">
                          {student.full_name}
                        </span>
                        <span className="block truncate font-mono text-[11.5px] text-ink-3">
                          {student.admission_number}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Subjects + quick access ──────────────────────────────────── */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4 text-ink-3" aria-hidden />
                Your subjects here
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {row.subjects.map((subject) => (
                <Link
                  key={subject.id}
                  to={`/teacher/subjects/${subject.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2"
                >
                  <SubjectBadge code={subject.code} color={subject.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                    {subject.name}
                  </span>
                  {subject.is_core ? <Badge variant="neutral">Core</Badge> : null}
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick access</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {[
                { to: `/teacher/lessons?class=${row.id}`, icon: Library, label: 'Lessons' },
                {
                  to: `/teacher/assignments?class=${row.id}`,
                  icon: ClipboardList,
                  label: 'Assignments',
                },
                {
                  to: `/teacher/grading?class=${row.id}`,
                  icon: FileSpreadsheet,
                  label: 'Gradebook',
                },
                {
                  to: `/teacher/timetable?class=${row.id}`,
                  icon: CalendarDays,
                  label: 'Timetable',
                },
                {
                  to: `/teacher/announcements?class=${row.id}`,
                  icon: Megaphone,
                  label: 'Announcements',
                },
              ].map((link) => {
                const Icon = link.icon;
                return (
                  <Button key={link.to} variant="secondary" className="justify-start" asChild>
                    <Link to={link.to}>
                      <Icon className="size-4" aria-hidden />
                      {link.label}
                    </Link>
                  </Button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
