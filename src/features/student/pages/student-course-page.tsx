import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  Megaphone,
  Video,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { listLessons } from '@/features/lessons';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadingBlock } from '@/shared/components/loading-screen';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { queryKeys } from '@/shared/lib/query-keys';
import { cn } from '@/shared/utils/cn';
import { formatDate, formatDueIn, formatScore } from '@/shared/utils/format';

import { getSubject } from '../api/student.service';
import { useStudentContext } from '../hooks/use-student-context';
import {
  useStudentAnnouncements,
  useStudentAssignments,
  useStudentGrades,
  useStudentSubjects,
} from '../hooks/use-student-data';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'lessons', label: 'Lessons' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'grades', label: 'Grades' },
  { id: 'announcements', label: 'Announcements' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const CONTENT_ICON = {
  video: Video,
  document: FileText,
  note: BookOpen,
  link: FileText,
  embed: Video,
  slide: FileText,
} as const;

/**
 * One subject, seen from inside.
 *
 * The tab lives in the URL (`?tab=lessons`) rather than component state so a
 * teacher can link a student straight to the assignments list, and a browser
 * back button does what it looks like it should.
 *
 * Each tab reuses the same feature hooks the standalone pages use, narrowed to
 * this subject — no bespoke queries, so the cache is shared with
 * /student/assignments and /student/grades.
 */
export default function StudentCoursePage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get('tab');
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : 'overview';

  const { classId, sessionId, className, isLoading: contextLoading } = useStudentContext();
  const { data: subjects } = useStudentSubjects();

  const subjectFromList = subjects?.find((s) => s.subjectId === subjectId);

  // Fall back to a direct fetch when the page is opened by deep link before the
  // subject list has been cached.
  const subjectQuery = useQuery({
    queryKey: queryKeys.subjects.detail(subjectId ?? 'none'),
    queryFn: () => getSubject(subjectId!),
    enabled: Boolean(subjectId) && !subjectFromList,
  });

  const subject = subjectFromList
    ? {
        name: subjectFromList.name,
        code: subjectFromList.code,
        color: subjectFromList.color,
        teacherName: subjectFromList.teacherName,
      }
    : subjectQuery.data
      ? {
          name: subjectQuery.data.name,
          code: subjectQuery.data.code,
          color: subjectQuery.data.color,
          teacherName: null,
        }
      : null;

  const setTab = (next: TabId) => {
    setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true });
  };

  if (contextLoading || (!subject && subjectQuery.isPending)) {
    return <LoadingBlock label="Loading subject…" />;
  }

  if (!subject) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Subject not found"
        description="You may not be taking this subject, or the link is out of date."
        action={
          <Button asChild variant="secondary">
            <Link to="/student/subjects">Back to my subjects</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Link
          to="/student/subjects"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink-2"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          My subjects
        </Link>

        <div className="flex items-start gap-4">
          <SubjectBadge code={subject.code} color={subject.color} size="lg" />
          <PageHeader
            title={subject.name}
            description={[subject.teacherName, className].filter(Boolean).join(' · ') || undefined}
            className="flex-1"
          />
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Subject sections"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            onClick={() => {
              setTab(item.id);
            }}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors',
              tab === item.id
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-3 hover:text-ink-2',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'overview' ? <OverviewTab subjectId={subjectId!} /> : null}
        {tab === 'lessons' ? (
          <LessonsTab classId={classId} subjectId={subjectId!} sessionId={sessionId} />
        ) : null}
        {tab === 'assignments' ? <AssignmentsTab subjectId={subjectId!} /> : null}
        {tab === 'grades' ? <GradesTab subjectId={subjectId!} /> : null}
        {tab === 'announcements' ? <AnnouncementsTab /> : null}
      </div>
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({ subjectId }: { subjectId: string }) {
  const { data: assignments } = useStudentAssignments({ subjectId });
  const { data: grades } = useStudentGrades({ subjectId });

  const outstanding = (assignments ?? []).filter((a) => new Date(a.due_at) > new Date()).length;
  const marked = grades?.length ?? 0;
  const average =
    grades && grades.length > 0
      ? Math.round(
          (grades.reduce((sum, g) => sum + Number(g.percentage), 0) / grades.length) * 10,
        ) / 10
      : null;

  const tiles = [
    { label: 'Work outstanding', value: String(outstanding) },
    { label: 'Assessments marked', value: String(marked) },
    { label: 'Running average', value: average === null ? '—' : `${average}%` },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="space-y-1.5 px-4 py-4">
            <p className="text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
              {tile.label}
            </p>
            <p className="text-2xl leading-none font-extrabold tracking-tight text-ink">
              {tile.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Lessons ─────────────────────────────────────────────────────────────────

function LessonsTab({
  classId,
  subjectId,
  sessionId,
}: {
  classId: string | null;
  subjectId: string;
  sessionId: string | null;
}) {
  const query = useQuery({
    queryKey: queryKeys.lessons.byClassSubject(classId ?? 'none', subjectId),
    queryFn: () =>
      listLessons({ classId: classId!, subjectId, ...(sessionId ? { sessionId } : {}) }),
    enabled: Boolean(classId),
  });

  if (query.isPending) return <LoadingBlock label="Loading lessons…" />;

  const lessons = query.data ?? [];
  if (lessons.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No lessons published yet"
        description="Your teacher has not published any lesson material for this subject."
      />
    );
  }

  return (
    <Card className="divide-y divide-border overflow-hidden p-0">
      {lessons.map((lesson) => {
        const Icon = CONTENT_ICON[lesson.content_type];
        return (
          <div key={lesson.id} className="flex items-start gap-3.5 px-4 py-3.5">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
              <Icon className="size-4" aria-hidden />
            </span>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {lesson.week_number ? (
                  <Badge variant="neutral">Week {lesson.week_number}</Badge>
                ) : null}
                <p className="text-sm font-semibold text-ink">{lesson.title}</p>
              </div>
              {lesson.summary ? (
                <p className="text-[13px] leading-relaxed text-ink-3">{lesson.summary}</p>
              ) : null}
              <p className="text-[11.5px] text-ink-3">
                {lesson.duration_minutes ? `${lesson.duration_minutes} min · ` : ''}
                {lesson.published_at ? formatDate(lesson.published_at) : 'Draft'}
              </p>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ── Assignments ─────────────────────────────────────────────────────────────

function AssignmentsTab({ subjectId }: { subjectId: string }) {
  const { data, isPending } = useStudentAssignments({ subjectId });

  if (isPending) return <LoadingBlock label="Loading assignments…" />;

  const assignments = data ?? [];
  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No assignments set"
        description="Nothing has been set for this subject yet."
      />
    );
  }

  return (
    <Card className="divide-y divide-border overflow-hidden p-0">
      {assignments.map((assignment) => {
        const due = formatDueIn(assignment.due_at);
        return (
          <Link
            key={assignment.id}
            to={`/student/assignments/${assignment.id}`}
            className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/60"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{assignment.title}</p>
              <p className="text-[12.5px] text-ink-3">Out of {assignment.max_score}</p>
            </div>
            <Badge
              variant={
                due.tone === 'overdue' ? 'danger' : due.tone === 'urgent' ? 'warning' : 'neutral'
              }
            >
              {due.label}
            </Badge>
          </Link>
        );
      })}
    </Card>
  );
}

// ── Grades ──────────────────────────────────────────────────────────────────

function GradesTab({ subjectId }: { subjectId: string }) {
  const { data, isPending } = useStudentGrades({ subjectId });

  if (isPending) return <LoadingBlock label="Loading results…" />;

  const grades = data ?? [];
  if (grades.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No results yet"
        description="Marks appear here once your teacher publishes them."
      />
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Assessment', 'Type', 'Score', '%', 'Grade'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-3 text-left text-[10.5px] font-bold tracking-wider text-ink-3 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {grades.map((grade) => (
              <tr key={grade.id}>
                <td className="px-4 py-3 font-medium text-ink">{grade.title}</td>
                <td className="px-4 py-3 text-ink-2 capitalize">{grade.assessment_type}</td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-2">
                  {formatScore(grade.score, grade.max_score)}
                </td>
                <td className="px-4 py-3 text-ink-2">{grade.percentage}%</td>
                <td className="px-4 py-3">
                  <Badge variant={Number(grade.percentage) >= 50 ? 'success' : 'danger'}>
                    {grade.letter_grade ?? '—'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Announcements ───────────────────────────────────────────────────────────

function AnnouncementsTab() {
  const { data, isPending } = useStudentAnnouncements({ limit: 20 });

  if (isPending) return <LoadingBlock label="Loading announcements…" />;

  const announcements = data ?? [];
  if (announcements.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Nothing posted"
        description="Notices from your school and teachers appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {announcements.map((announcement) => (
        <Card key={announcement.id}>
          <CardContent className="space-y-2 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {announcement.priority !== 'normal' ? (
                <Badge variant={announcement.priority === 'urgent' ? 'danger' : 'warning'}>
                  {announcement.priority}
                </Badge>
              ) : null}
              <p className="text-sm font-bold text-ink">{announcement.title}</p>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-2">{announcement.body}</p>
            <p className="text-[11.5px] text-ink-3">
              {announcement.author?.full_name ?? 'School admin'} ·{' '}
              {formatDate(announcement.publish_at)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
