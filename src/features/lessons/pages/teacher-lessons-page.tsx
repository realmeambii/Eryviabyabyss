import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock, Eye, EyeOff, Library, Pencil, Plus, Search, Trash2 } from 'lucide-react';

import { useTeacherScope } from '@/features/teacher';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { DataTable, type Column } from '@/shared/components/data-table';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Select } from '@/shared/components/ui/select';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { htmlToText } from '@/shared/lib/sanitize-html';
import { className as formatClassName, formatRelative, truncate } from '@/shared/utils/format';
import type { Lesson } from '@/shared/types';

import { LessonEditorDialog } from '../components/lesson-editor-dialog';
import { useLessonMutations, useLessons } from '../hooks/use-lessons';
import type { LessonWithAuthor } from '../api/lessons.service';

/**
 * The teacher's lesson library.
 *
 * Filters live in the URL rather than component state, so "my JSS 1A physics
 * lessons" is a link a teacher can bookmark and the class page can hand over —
 * `/teacher/lessons?class=…` arrives already narrowed.
 */
export default function TeacherLessonsPage() {
  const scope = useTeacherScope();
  const [params, setParams] = useSearchParams();

  const classId = params.get('class') ?? '';
  const subjectId = params.get('subject') ?? '';
  const status = params.get('status') ?? '';

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LessonWithAuthor | null>(null);

  const debounced = useDebouncedValue(search, 250);
  const { publish, unpublish, remove } = useLessonMutations();

  // `?new=1` from the dashboard's quick action opens the editor straight away.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setCreating(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const query = useLessons(
    {
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      status: (status || undefined) as Lesson['status'] | undefined,
      sessionId: scope.sessionId ?? undefined,
    },
    Boolean(scope.sessionId),
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    if (term === '') return query.data ?? [];

    return (query.data ?? []).filter(
      (lesson) =>
        lesson.title.toLowerCase().includes(term) ||
        (lesson.summary ?? '').toLowerCase().includes(term) ||
        htmlToText(lesson.content).toLowerCase().includes(term),
    );
  }, [query.data, debounced]);

  const subjectsFor = classId
    ? (scope.classes.find((row) => row.id === classId)?.subjects ?? [])
    : scope.subjects;

  const columns: Column<LessonWithAuthor>[] = [
    {
      id: 'lesson',
      header: 'Lesson',
      cell: (row) => (
        <div className="min-w-0">
          <Link
            to={`/teacher/lessons/${row.id}`}
            className="block truncate font-semibold text-ink hover:text-brand"
          >
            {row.title}
          </Link>
          <p className="truncate text-[12px] text-ink-3">
            {row.summary ? truncate(row.summary, 70) : truncate(htmlToText(row.content), 70) || '—'}
          </p>
        </div>
      ),
    },
    {
      id: 'context',
      header: 'Class · subject',
      // Resolved from the shared scope rather than joined into the query: the
      // teacher already holds both lists, and a lesson can only belong to a
      // pairing they teach.
      cell: (row) => {
        const lessonClass = scope.classes.find((entry) => entry.id === row.class_id);
        const lessonSubject = scope.subjects.find((entry) => entry.id === row.subject_id);

        return (
          <div className="flex items-center gap-2">
            {lessonSubject ? (
              <SubjectBadge code={lessonSubject.code} color={lessonSubject.color} size="sm" />
            ) : null}
            <span className="whitespace-nowrap text-ink-2">
              {lessonClass ? formatClassName(lessonClass.name, lessonClass.arm) : '—'}
            </span>
          </div>
        );
      },
    },
    {
      id: 'week',
      header: 'Week',
      secondary: true,
      cell: (row) => <span className="text-ink-2">{row.week_number ?? '—'}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => <LessonStatus lesson={row} />,
    },
    {
      id: 'updated',
      header: 'Updated',
      secondary: true,
      cell: (row) => (
        <span className="whitespace-nowrap text-ink-3">{formatRelative(row.updated_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      className: 'text-right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          {row.status === 'published' ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Unpublish ${row.title}`}
              loading={unpublish.isPending && unpublish.variables === row.id}
              onClick={() => {
                unpublish.mutate(row.id);
              }}
            >
              <EyeOff className="size-3.5" aria-hidden />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Publish ${row.title}`}
              loading={publish.isPending && publish.variables === row.id}
              onClick={() => {
                publish.mutate(row.id);
              }}
            >
              <Eye className="size-3.5" aria-hidden />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${row.title}`}
            onClick={() => {
              setEditing(row);
            }}
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${row.title}`}
            onClick={() => {
              setDeleting(row);
            }}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lessons"
        description="Everything you have written for your classes this term."
        actions={
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            New lesson
          </Button>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        isLoading={query.isPending || scope.isPending}
        error={query.error}
        empty={{
          icon: Library,
          title: debounced || classId || subjectId || status ? 'Nothing matches' : 'No lessons yet',
          description:
            debounced || classId || subjectId || status
              ? 'Try clearing a filter.'
              : 'Write your first lesson. It saves as a draft, so nothing is visible to pupils until you publish it.',
          action: (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              New lesson
            </Button>
          ),
        }}
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Search lessons"
                className="pl-10"
                aria-label="Search lessons"
              />
            </div>

            <Select
              value={classId}
              onChange={(event) => {
                setParam('class', event.target.value);
              }}
              className="w-auto"
              aria-label="Filter by class"
              options={[
                { value: '', label: 'All classes' },
                ...scope.classes.map((row) => ({
                  value: row.id,
                  label: formatClassName(row.name, row.arm),
                })),
              ]}
            />

            <Select
              value={subjectId}
              onChange={(event) => {
                setParam('subject', event.target.value);
              }}
              className="w-auto"
              aria-label="Filter by subject"
              options={[
                { value: '', label: 'All subjects' },
                ...subjectsFor.map((subject) => ({ value: subject.id, label: subject.name })),
              ]}
            />

            <Select
              value={status}
              onChange={(event) => {
                setParam('status', event.target.value);
              }}
              className="w-auto"
              aria-label="Filter by status"
              options={[
                { value: '', label: 'Any status' },
                { value: 'draft', label: 'Drafts' },
                { value: 'published', label: 'Published' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
          </div>
        }
      />

      <LessonEditorDialog
        open={creating || editing !== null}
        lesson={editing}
        defaultClassId={classId || undefined}
        defaultSubjectId={subjectId || undefined}
        onOpenChange={(next) => {
          if (next) return;
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title={`Delete “${deleting?.title ?? 'lesson'}”?`}
        description={
          deleting?.status === 'published'
            ? 'This lesson is live. Deleting it removes it from every pupil who has it, along with its attachments. Unpublishing hides it instead and keeps the work.'
            : 'The lesson and its attachments are removed. This cannot be undone.'
        }
        confirmLabel="Delete lesson"
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
            },
          });
        }}
      />
    </div>
  );
}

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * Three states, not two. "Published but not yet open" is the one teachers care
 * about most when preparing a fortnight ahead, and collapsing it into
 * "Published" makes the lesson list lie about what pupils can see.
 */
export function LessonStatus({ lesson }: { lesson: Pick<Lesson, 'status' | 'available_from'> }) {
  if (lesson.status !== 'published') {
    return <Badge variant="neutral">{lesson.status}</Badge>;
  }

  const scheduled = lesson.available_from && new Date(lesson.available_from) > new Date();

  return scheduled ? (
    <Badge variant="warning">
      <Clock className="size-3" aria-hidden />
      Opens {formatRelative(lesson.available_from)}
    </Badge>
  ) : (
    <Badge variant="success">Live</Badge>
  );
}
