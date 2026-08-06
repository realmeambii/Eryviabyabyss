import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, Eye, EyeOff, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';

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
import { className as formatClassName, formatDueIn, formatScore } from '@/shared/utils/format';
import type { Assignment } from '@/shared/types';

import type { AssignmentWithContext } from '../api/assignments.service';
import { AssignmentEditorDialog } from '../components/assignment-editor-dialog';
import { useAssignmentMutations, useAssignments } from '../hooks/use-assignments';

/**
 * The teacher's assignment list.
 *
 * Filters live in the URL for the same reason lessons do: the class and subject
 * pages hand over a narrowed link rather than dumping the teacher into an
 * unfiltered list they have to re-filter.
 */
export default function TeacherAssignmentsPage() {
  const scope = useTeacherScope();
  const [params, setParams] = useSearchParams();

  const classId = params.get('class') ?? '';
  const subjectId = params.get('subject') ?? '';
  const status = params.get('status') ?? '';

  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [deleting, setDeleting] = useState<AssignmentWithContext | null>(null);
  const [publishing, setPublishing] = useState<AssignmentWithContext | null>(null);

  const debounced = useDebouncedValue(search, 250);
  const { publish, unpublish, close, remove } = useAssignmentMutations();

  useEffect(() => {
    if (params.get('new') !== '1') return;
    setCreating(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const query = useAssignments(
    {
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      status: (status || undefined) as Assignment['status'] | undefined,
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
      (row) =>
        row.title.toLowerCase().includes(term) ||
        (row.description ?? '').toLowerCase().includes(term),
    );
  }, [query.data, debounced]);

  const subjectsFor = classId
    ? (scope.classes.find((row) => row.id === classId)?.subjects ?? [])
    : scope.subjects;

  const columns: Column<AssignmentWithContext>[] = [
    {
      id: 'assignment',
      header: 'Assignment',
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <SubjectBadge
            code={row.subject?.code ?? '—'}
            color={row.subject?.color ?? '#64748b'}
            size="sm"
          />
          <div className="min-w-0">
            <Link
              to={`/teacher/assignments/${row.id}`}
              className="block truncate font-semibold text-ink hover:text-brand"
            >
              {row.title}
            </Link>
            <p className="truncate text-[12px] text-ink-3">
              {row.class ? formatClassName(row.class.name, row.class.arm) : '—'} ·{' '}
              {row.assessment_type}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'due',
      header: 'Due',
      cell: (row) => {
        const due = formatDueIn(row.due_at);
        return (
          <Badge
            variant={
              due.tone === 'overdue' ? 'danger' : due.tone === 'urgent' ? 'warning' : 'neutral'
            }
          >
            {due.label}
          </Badge>
        );
      },
    },
    {
      id: 'marks',
      header: 'Marks',
      secondary: true,
      cell: (row) => (
        <span className="whitespace-nowrap text-ink-2">
          {formatScore(row.max_score, row.max_score).split('/')[1]?.trim() ?? row.max_score}
          <span className="text-ink-3"> · {Math.round(row.weight * 100)}% of term</span>
        </span>
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

  const isFiltered = Boolean(debounced || classId || subjectId || status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description="Set work, track who has handed in, and return marks."
        actions={
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            New assignment
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
          icon: ClipboardList,
          title: isFiltered ? 'Nothing matches' : 'No assignments yet',
          description: isFiltered
            ? 'Try clearing a filter.'
            : 'Set your first piece of work. It saves as a draft — the class is notified only when you publish.',
          action: (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              New assignment
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
                placeholder="Search assignments"
                className="pl-10"
                aria-label="Search assignments"
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

      <AssignmentEditorDialog
        open={creating || editing !== null}
        assignment={editing}
        defaultClassId={classId || undefined}
        defaultSubjectId={subjectId || undefined}
        onOpenChange={(next) => {
          if (next) return;
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={publishing !== null}
        onOpenChange={(next) => {
          if (!next) setPublishing(null);
        }}
        title={`Publish “${publishing?.title ?? 'assignment'}”?`}
        description="Every pupil in the class is notified straight away and can start handing in. You can unpublish afterwards, but the notification cannot be recalled."
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
        title={`Delete “${deleting?.title ?? 'assignment'}”?`}
        description="Every submission and mark against it goes too, including gradebook rows already published to pupils. Closing it instead stops new submissions and keeps the record."
        confirmLabel="Delete assignment"
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
