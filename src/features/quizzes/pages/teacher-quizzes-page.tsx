import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ClipboardCheck,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';

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
import { className as formatClassName, formatRelative } from '@/shared/utils/format';
import type { Quiz } from '@/shared/types';

import { QuizEditorDialog } from '../components/quiz-editor-dialog';
import { useQuizMutations, useTeacherQuizzes } from '../hooks/use-quizzes';

/**
 * The teacher's quiz list.
 *
 * A quiz with no questions is not a paper, so creating one sends the teacher
 * straight to the builder rather than back to this table.
 */
export default function TeacherQuizzesPage() {
  const scope = useTeacherScope();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const classId = params.get('class') ?? '';
  const subjectId = params.get('subject') ?? '';
  const status = params.get('status') ?? '';

  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Quiz | null>(null);
  const [deleting, setDeleting] = useState<Quiz | null>(null);
  const [publishing, setPublishing] = useState<Quiz | null>(null);

  const debounced = useDebouncedValue(search, 250);
  const { publish, unpublish, close, duplicate, remove } = useQuizMutations();

  useEffect(() => {
    if (params.get('new') !== '1') return;
    setCreating(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const query = useTeacherQuizzes(
    {
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      status: (status || undefined) as Quiz['status'] | undefined,
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
    return (query.data ?? []).filter((row) => row.title.toLowerCase().includes(term));
  }, [query.data, debounced]);

  const subjectsFor = classId
    ? (scope.classes.find((row) => row.id === classId)?.subjects ?? [])
    : scope.subjects;

  const columns: Column<Quiz>[] = [
    {
      id: 'quiz',
      header: 'Quiz',
      cell: (row) => {
        const subject = scope.subjects.find((entry) => entry.id === row.subject_id);
        const quizClass = scope.classes.find((entry) => entry.id === row.class_id);
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            {subject ? <SubjectBadge code={subject.code} color={subject.color} size="sm" /> : null}
            <div className="min-w-0">
              <Link
                to={`/teacher/quizzes/${row.id}`}
                className="block truncate font-semibold text-ink hover:text-brand"
              >
                {row.title}
              </Link>
              <p className="truncate text-[12px] text-ink-3">
                {quizClass ? formatClassName(quizClass.name, quizClass.arm) : '—'} ·{' '}
                {row.duration_minutes} min · {row.total_points} marks
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: 'window',
      header: 'Window',
      secondary: true,
      cell: (row) => (
        <span className="whitespace-nowrap text-ink-2">
          {row.opens_at ? formatRelative(row.opens_at) : 'No window'}
        </span>
      ),
    },
    {
      id: 'results',
      header: 'Results',
      secondary: true,
      cell: (row) =>
        row.show_results_immediately ? (
          <Badge variant="success">Visible</Badge>
        ) : (
          <Badge variant="neutral">Held</Badge>
        ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge
          variant={
            row.status === 'published' ? 'success' : row.status === 'closed' ? 'warning' : 'neutral'
          }
        >
          {row.status}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      className: 'text-right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          {row.status === 'draft' ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Publish ${row.title}`}
              onClick={() => {
                setPublishing(row);
              }}
            >
              <Eye className="size-3.5" aria-hidden />
            </Button>
          ) : null}
          {row.status === 'published' ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Close ${row.title}`}
                loading={close.isPending && close.variables === row.id}
                onClick={() => {
                  close.mutate(row.id);
                }}
              >
                <Lock className="size-3.5" aria-hidden />
              </Button>
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
            </>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Duplicate ${row.title}`}
            loading={duplicate.isPending && duplicate.variables?.quizId === row.id}
            onClick={() => {
              duplicate.mutate({ quizId: row.id });
            }}
          >
            <Copy className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Settings for ${row.title}`}
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

  const isFiltered = Boolean(debounced || classId || subjectId || status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quizzes and tests"
        description="Build papers, watch them being sat, and release the results."
        actions={
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            New quiz
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
          icon: ClipboardCheck,
          title: isFiltered ? 'Nothing matches' : 'No quizzes yet',
          description: isFiltered
            ? 'Try clearing a filter.'
            : 'Build your first paper. It stays a draft until you publish, and you can pull questions from the school question bank.',
          action: (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              New quiz
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
                placeholder="Search quizzes"
                className="pl-10"
                aria-label="Search quizzes"
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
                { value: 'closed', label: 'Closed' },
              ]}
            />
          </div>
        }
      />

      <QuizEditorDialog
        open={creating || editing !== null}
        quiz={editing}
        defaultClassId={classId || undefined}
        defaultSubjectId={subjectId || undefined}
        onOpenChange={(next) => {
          if (next) return;
          setCreating(false);
          setEditing(null);
        }}
        onCreated={(quiz) => {
          void navigate(`/teacher/quizzes/${quiz.id}`);
        }}
      />

      <ConfirmDialog
        open={publishing !== null}
        onOpenChange={(next) => {
          if (!next) setPublishing(null);
        }}
        title={`Publish “${publishing?.title ?? 'quiz'}”?`}
        description={
          (publishing?.total_points ?? 0) === 0
            ? 'This paper has no questions yet. Pupils would open an empty test — add questions first.'
            : 'The class is notified straight away and can sit the paper inside its window. You can unpublish afterwards, but the notification cannot be recalled.'
        }
        confirmLabel="Publish and notify"
        isPending={publish.isPending}
        onConfirm={() => {
          if (!publishing) return;
          publish.mutate(publishing.id, {
            onSuccess: () => {
              setPublishing(null);
            },
          });
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title={`Delete “${deleting?.title ?? 'quiz'}”?`}
        description="Every question and every attempt goes with it, including marks already in the gradebook. Closing it instead stops new attempts and keeps the record."
        confirmLabel="Delete quiz"
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
