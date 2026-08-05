import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Archive, BookOpen, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { z } from 'zod';

import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { DataTable, type Column } from '@/shared/components/data-table';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Select } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';

import type { SubjectWithUsage } from '../api/subjects.service';
import { useSubjectMutations, useSubjects } from '../hooks/use-admin-academics';

/**
 * Subject management.
 *
 * Archive rather than delete is the default action, and the table says why: a
 * subject with any teaching history is referenced by assignments and grades,
 * and `ON DELETE RESTRICT` would reject the delete anyway. Offering a button
 * that always fails would be worse than not offering it.
 */

const DEPARTMENTS = [
  'Sciences',
  'Languages',
  'Humanities',
  'Commercial',
  'Vocational',
  'Technology',
] as const;

const subjectSchema = z.object({
  name: z.string().trim().min(2, 'Enter the subject name').max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,6}$/, 'Two to six letters, e.g. MTH'),
  department: z.string().trim().optional(),
  description: z.string().trim().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour'),
  is_core: z.boolean(),
});

type SubjectInput = z.infer<typeof subjectSchema>;

/**
 * An untouched optional text input yields '', but the column is nullable and
 * means "not set" — so blank has to become null rather than an empty string,
 * otherwise `department is null` filters stop matching.
 */
function nullIfBlank(value: string | undefined): string | null {
  const trimmed = value?.trim();
  // Not `trimmed ?? null`: that keeps '' for a whitespace-only input, which is
  // exactly the value we are trying to turn into null.
  if (trimmed === undefined || trimmed.length === 0) return null;
  return trimmed;
}

export default function AdminSubjectsPage() {
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<SubjectWithUsage | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<SubjectWithUsage | null>(null);

  const debounced = useDebouncedValue(search, 250);
  const { data, isPending, error } = useSubjects({ includeInactive: true });
  const { archive, restore } = useSubjectMutations();

  const rows = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    return (data ?? [])
      .filter((subject) => (showArchived ? true : subject.is_active))
      .filter(
        (subject) =>
          term === '' ||
          subject.name.toLowerCase().includes(term) ||
          subject.code.toLowerCase().includes(term) ||
          (subject.department ?? '').toLowerCase().includes(term),
      );
  }, [data, debounced, showArchived]);

  const columns: Column<SubjectWithUsage>[] = [
    {
      id: 'subject',
      header: 'Subject',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <SubjectBadge code={row.code} color={row.color} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{row.name}</p>
            <p className="truncate text-[12px] text-ink-3">{row.department ?? 'No department'}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      secondary: true,
      cell: (row) =>
        row.is_core ? (
          <Badge variant="brand">Core</Badge>
        ) : (
          <Badge variant="neutral">Elective</Badge>
        ),
    },
    {
      id: 'classes',
      header: 'Classes',
      secondary: true,
      cell: (row) => <span className="text-ink-2">{row.class_count}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) =>
        row.is_active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="neutral">Archived</Badge>
        ),
    },
    {
      id: 'actions',
      header: '',
      className: 'text-right',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${row.name}`}
            onClick={() => {
              setEditing(row);
            }}
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          {row.is_active ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Archive ${row.name}`}
              onClick={() => {
                setArchiving(row);
              }}
            >
              <Archive className="size-3.5" aria-hidden />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Restore ${row.name}`}
              loading={restore.isPending && restore.variables === row.id}
              onClick={() => {
                restore.mutate(row.id);
              }}
            >
              <RotateCcw className="size-3.5" aria-hidden />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subjects"
        description="The subjects your school teaches, and which classes take them."
        actions={
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            New subject
          </Button>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        isLoading={isPending}
        error={error}
        empty={{
          icon: BookOpen,
          title: debounced ? 'No subjects match' : 'No subjects yet',
          description: debounced
            ? `Nothing matches “${debounced}”.`
            : 'Add the subjects your school teaches to start building class curricula.',
        }}
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Search by name, code or department"
                className="pl-10"
                aria-label="Search subjects"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => {
                  setShowArchived(event.target.checked);
                }}
                className="size-3.5 accent-brand"
              />
              Show archived
            </label>
          </div>
        }
      />

      <SubjectDialog
        open={creating || editing !== null}
        subject={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null);
        }}
        title={`Archive ${archiving?.name ?? 'subject'}?`}
        description={
          archiving && archiving.class_count > 0 ? (
            <>
              It is on the curriculum for <strong>{archiving.class_count}</strong>{' '}
              {archiving.class_count === 1 ? 'class' : 'classes'}. Archiving hides it from pickers
              but keeps every lesson, assignment and mark already recorded against it.
            </>
          ) : (
            'It will be hidden from pickers. Nothing already recorded is affected, and you can restore it at any time.'
          )
        }
        confirmLabel="Archive subject"
        destructive
        isPending={archive.isPending}
        onConfirm={() => {
          if (!archiving) return;
          archive.mutate(archiving.id, {
            onSuccess: () => {
              setArchiving(null);
            },
          });
        }}
      />
    </div>
  );
}

// ── Create / edit ───────────────────────────────────────────────────────────

function SubjectDialog({
  open,
  subject,
  onOpenChange,
}: {
  open: boolean;
  subject: SubjectWithUsage | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, update } = useSubjectMutations();
  const isEdit = subject !== null;

  const form = useForm<SubjectInput>({
    resolver: zodResolver(subjectSchema),
    values: {
      name: subject?.name ?? '',
      code: subject?.code ?? '',
      department: subject?.department ?? '',
      description: subject?.description ?? '',
      color: subject?.color ?? '#2563eb',
      is_core: subject?.is_core ?? false,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const payload = {
      name: values.name,
      code: values.code,
      department: nullIfBlank(values.department),
      description: nullIfBlank(values.description),
      color: values.color,
      is_core: values.is_core,
    };

    const done = {
      onSuccess: () => {
        onOpenChange(false);
      },
    };

    if (isEdit) update.mutate({ id: subject.id, patch: payload }, done);
    else create.mutate(payload, done);
  });

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${subject.name}` : 'New subject'}</DialogTitle>
          <DialogDescription>
            The code is the short label shown on tiles and timetables.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate>
            <DialogBody>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Further Mathematics" autoFocus />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="FMT" maxLength={6} className="uppercase" />
                      </FormControl>
                      <FormDescription>Two to six letters.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <FormControl>
                        <Select
                          {...field}
                          placeholder="Choose a department"
                          options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tile colour</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={field.value}
                          onChange={field.onChange}
                          aria-label="Subject colour"
                          className="h-9.5 w-14 cursor-pointer rounded-lg border border-border bg-transparent p-1"
                        />
                        <SubjectBadge
                          code={form.watch('code') || '—'}
                          color={field.value}
                          size="md"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="Optional." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_core"
                render={({ field }) => (
                  <FormItem>
                    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-ink-2">
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(event) => {
                          field.onChange(event.target.checked);
                        }}
                        className="size-3.5 accent-brand"
                      />
                      Core subject — taken by every class by default
                    </label>
                  </FormItem>
                )}
              />
            </DialogBody>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onOpenChange(false);
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" loading={isPending}>
                {isEdit ? 'Save changes' : 'Create subject'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
