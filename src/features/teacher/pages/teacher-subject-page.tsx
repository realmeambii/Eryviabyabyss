import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  Library,
  Megaphone,
  Users,
} from 'lucide-react';

import { listAssignments } from '@/features/assignments';
import { listLessons } from '@/features/lessons';
import { listQuizzes } from '@/features/quizzes';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { queryKeys } from '@/shared/lib/query-keys';
import {
  className as formatClassName,
  formatDate,
  formatRelative,
  truncate,
} from '@/shared/utils/format';

import { StatTile } from '../components/stat-tile';
import { useMySubject, useTeacherScope } from '../hooks/use-teacher-scope';

/**
 * A subject, from the teacher's side: the classes that take it, and the
 * lessons, assignments and quizzes they have set for it this term.
 *
 * Each panel is its own query. A subject with two hundred lessons and no
 * quizzes should render the lesson list immediately rather than waiting on an
 * empty quiz fetch, and a failure in one panel leaves the rest usable.
 */
export default function TeacherSubjectPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const scope = useTeacherScope();
  const subject = useMySubject(subjectId);
  const sessionId = scope.sessionId ?? undefined;
  const enabled = Boolean(subjectId && sessionId);

  const lessons = useQuery({
    queryKey: queryKeys.lessons.list({ subjectId, sessionId, view: 'subject' }),
    queryFn: () => listLessons({ subjectId, sessionId, limit: 8 }),
    enabled,
    staleTime: 60_000,
  });

  const assignments = useQuery({
    queryKey: queryKeys.assignments.list({ subjectId, sessionId, view: 'subject' }),
    queryFn: () => listAssignments({ subjectId, sessionId, limit: 8 }),
    enabled,
    staleTime: 60_000,
  });

  const quizzes = useQuery({
    queryKey: queryKeys.quizzes.list({ subjectId, sessionId, view: 'subject' }),
    queryFn: () => listQuizzes({ subjectId, sessionId, limit: 8 }),
    enabled,
    staleTime: 60_000,
  });

  if (scope.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Not one of your subjects"
        description="This subject is not assigned to you this term."
        action={
          <Button asChild>
            <Link to="/teacher/subjects">Back to my subjects</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'My subjects' }, { label: subject.name }]}
        title={subject.name}
        description={`${subject.code} · taught to ${subject.classes.length} ${subject.classes.length === 1 ? 'class' : 'classes'} this term`}
        actions={
          <div className="flex items-center gap-2">
            {subject.is_core ? <Badge variant="neutral">Core</Badge> : null}
            <SubjectBadge code={subject.code} color={subject.color} size="md" />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Users} label="Classes" value={subject.classes.length} />
        <StatTile
          icon={Library}
          label="Lessons"
          value={lessons.data?.length}
          hint="most recent shown"
          isLoading={lessons.isPending}
        />
        <StatTile
          icon={ClipboardList}
          label="Assignments"
          value={assignments.data?.length}
          isLoading={assignments.isPending}
        />
        <StatTile
          icon={ClipboardCheck}
          label="Quizzes"
          value={quizzes.data?.length}
          isLoading={quizzes.isPending}
        />
      </div>

      {/* ── Classes taking it ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-ink-3" aria-hidden />
            Classes taking {subject.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {subject.classes.map((row) => (
            <Button key={row.id} variant="secondary" size="sm" asChild>
              <Link to={`/teacher/classes/${row.id}`}>{formatClassName(row.name, row.arm)}</Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <PanelList
          icon={Library}
          title="Lessons"
          allHref={`/teacher/lessons?subject=${subject.id}`}
          isPending={lessons.isPending}
          error={lessons.error}
          items={(lessons.data ?? []).map((lesson) => ({
            id: lesson.id,
            to: `/teacher/lessons/${lesson.id}`,
            title: lesson.title,
            meta: `${lesson.week_number ? `Week ${lesson.week_number} · ` : ''}${lesson.status}`,
            status: lesson.status,
          }))}
          emptyLabel="No lessons yet."
        />

        <PanelList
          icon={ClipboardList}
          title="Assignments"
          allHref={`/teacher/assignments?subject=${subject.id}`}
          isPending={assignments.isPending}
          error={assignments.error}
          items={(assignments.data ?? []).map((assignment) => ({
            id: assignment.id,
            to: `/teacher/assignments/${assignment.id}`,
            title: assignment.title,
            meta: `Due ${formatDate(assignment.due_at)}`,
            status: assignment.status,
          }))}
          emptyLabel="Nothing set yet."
        />

        <PanelList
          icon={ClipboardCheck}
          title="Quizzes"
          allHref={`/teacher/quizzes?subject=${subject.id}`}
          isPending={quizzes.isPending}
          error={quizzes.error}
          items={(quizzes.data ?? []).map((quiz) => ({
            id: quiz.id,
            to: `/teacher/quizzes/${quiz.id}`,
            title: quiz.title,
            meta: quiz.opens_at ? `Opens ${formatRelative(quiz.opens_at)}` : 'No window set',
            status: quiz.status,
          }))}
          emptyLabel="No quizzes built yet."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Also for this subject</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link to={`/teacher/grading?subject=${subject.id}`}>
              <FileSpreadsheet className="size-4" aria-hidden />
              Gradebook
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to={`/teacher/announcements?subject=${subject.id}`}>
              <Megaphone className="size-4" aria-hidden />
              Announcements
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

interface PanelItem {
  id: string;
  to: string;
  title: string;
  meta: string;
  status: string;
}

function PanelList({
  icon: Icon,
  title,
  allHref,
  items,
  isPending,
  error,
  emptyLabel,
}: {
  icon: typeof Library;
  title: string;
  allHref: string;
  items: PanelItem[];
  isPending: boolean;
  error: Error | null;
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-ink-3" aria-hidden />
          {title}
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to={allHref}>All</Link>
        </Button>
      </CardHeader>

      <CardContent>
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="py-6 text-center text-[13px] text-danger">{error.message}</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-3">{emptyLabel}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                <Link to={item.to} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">
                      {truncate(item.title, 40)}
                    </span>
                    <span className="block truncate text-[12px] text-ink-3">{item.meta}</span>
                  </span>
                  <Badge variant={item.status === 'published' ? 'success' : 'neutral'}>
                    {item.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
