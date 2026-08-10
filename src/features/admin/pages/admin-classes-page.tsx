import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Library, Plus, Search, Trash2, UserPlus, Users } from 'lucide-react';

import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { DataTable, type Column } from '@/shared/components/data-table';
import { EmptyState } from '@/shared/components/empty-state';
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
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { className as formatClassName } from '@/shared/utils/format';

import type { ClassWithCounts } from '../api/classes.service';
import {
  useAssignableTeachers,
  useClassTeaching,
  useClasses,
  useSubjects,
  useTeachingMutations,
} from '../hooks/use-admin-academics';

/**
 * Classes, and who teaches what in them.
 *
 * The teaching panel is the part that matters. `teacher_assignments` is what
 * makes a teacher's portal work at all — `app.teaches_class()` sits in the
 * USING clause of every teacher policy, so a teacher with no row here signs in
 * to an empty dashboard and cannot author anything. Until this screen existed
 * the only way to create one was by hand against the database.
 */
export default function AdminClassesPage() {
  // Seeded from `?q=` so a class opened from global search arrives filtered.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [managing, setManagingId] = useState<string | null>(null);

  const debounced = useDebouncedValue(search, 250);
  const classes = useClasses();

  const rows = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    if (term === '') return classes.data ?? [];

    return (classes.data ?? []).filter(
      (row) =>
        formatClassName(row.name, row.arm).toLowerCase().includes(term) ||
        (row.room ?? '').toLowerCase().includes(term) ||
        (row.form_teacher?.user?.full_name ?? '').toLowerCase().includes(term),
    );
  }, [classes.data, debounced]);

  const managingClass = managing
    ? ((classes.data ?? []).find((row) => row.id === managing) ?? null)
    : null;

  const columns: Column<ClassWithCounts>[] = [
    {
      id: 'class',
      header: 'Class',
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{formatClassName(row.name, row.arm)}</p>
          <p className="truncate text-[12px] text-ink-3">
            {row.room ? `Room ${row.room}` : 'No room'} · capacity {row.capacity}
          </p>
        </div>
      ),
    },
    {
      id: 'form_teacher',
      header: 'Form teacher',
      secondary: true,
      cell: (row) => <span className="text-ink-2">{row.form_teacher?.user?.full_name ?? '—'}</span>,
    },
    {
      id: 'students',
      header: 'On roll',
      cell: (row) => <span className="text-ink-2">{row.student_count}</span>,
    },
    {
      id: 'subjects',
      header: 'Subjects',
      secondary: true,
      cell: (row) => <span className="text-ink-2">{row.subject_count}</span>,
    },
    {
      id: 'actions',
      header: '',
      className: 'text-right',
      cell: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setManagingId(row.id);
          }}
        >
          <UserPlus className="size-3.5" aria-hidden />
          Teaching
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classes"
        description="Who is on the roll, which subjects they take, and who teaches them."
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        isLoading={classes.isPending}
        error={classes.error}
        empty={{
          icon: Library,
          title: debounced ? 'Nothing matches' : 'No classes this term',
          description: debounced
            ? `Nothing matches “${debounced}”.`
            : 'Classes are created per term. Once one exists you can set its curriculum and assign teachers.',
        }}
        toolbar={
          <div className="relative max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Search by class, room or form teacher"
              className="pl-10"
              aria-label="Search classes"
            />
          </div>
        }
      />

      <TeachingDialog
        schoolClass={managingClass}
        onOpenChange={(open) => {
          if (!open) setManagingId(null);
        }}
      />
    </div>
  );
}

// ── Teaching ────────────────────────────────────────────────────────────────

function TeachingDialog({
  schoolClass,
  onOpenChange,
}: {
  schoolClass: ClassWithCounts | null;
  onOpenChange: (open: boolean) => void;
}) {
  const teaching = useClassTeaching(schoolClass?.id);
  const teachers = useAssignableTeachers();
  const subjects = useSubjects();
  const { assign, unassign } = useTeachingMutations();

  const [teacherId, setTeacherId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);

  const rows = useMemo(() => teaching.data ?? [], [teaching.data]);

  /** Subjects this class takes but nobody teaches yet — the gap to fill. */
  const unstaffed = useMemo(() => {
    const staffed = new Set(rows.map((row) => row.subject_id));
    return (subjects.data ?? []).filter((subject) => !staffed.has(subject.id));
  }, [rows, subjects.data]);

  return (
    <>
      <Dialog open={schoolClass !== null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Teaching {schoolClass ? formatClassName(schoolClass.name, schoolClass.arm) : ''}
            </DialogTitle>
            <DialogDescription>
              A teacher sees a class only once they are assigned to a subject in it. Without a row
              here their dashboard is empty and they cannot set work.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {/* ── Add ──────────────────────────────────────────────────── */}
            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ta-teacher">Teacher</Label>
                  <Select
                    id="ta-teacher"
                    value={teacherId}
                    onChange={(event) => {
                      setTeacherId(event.target.value);
                    }}
                    disabled={teachers.isPending}
                    placeholder={teachers.isPending ? 'Loading…' : 'Choose a teacher'}
                    options={(teachers.data ?? []).map((teacher) => ({
                      value: teacher.id,
                      label: `${teacher.full_name} · ${teacher.staff_number}`,
                    }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ta-subject">Subject</Label>
                  <Select
                    id="ta-subject"
                    value={subjectId}
                    onChange={(event) => {
                      setSubjectId(event.target.value);
                    }}
                    disabled={subjects.isPending}
                    placeholder="Choose a subject"
                    options={(subjects.data ?? []).map((subject) => ({
                      value: subject.id,
                      label: subject.name,
                    }))}
                  />
                </div>
              </div>

              <Button
                size="sm"
                disabled={!teacherId || !subjectId || !schoolClass}
                loading={assign.isPending}
                onClick={() => {
                  if (!schoolClass) return;
                  assign.mutate(
                    { teacherId, classId: schoolClass.id, subjectId },
                    {
                      onSuccess: () => {
                        setTeacherId('');
                        setSubjectId('');
                      },
                    },
                  );
                }}
              >
                <Plus className="size-4" aria-hidden />
                Assign
              </Button>

              {unstaffed.length > 0 ? (
                <p className="text-[12px] text-ink-3">
                  Nobody assigned yet for:{' '}
                  {unstaffed
                    .slice(0, 6)
                    .map((subject) => subject.code)
                    .join(', ')}
                  {unstaffed.length > 6 ? ` and ${unstaffed.length - 6} more` : ''}.
                </p>
              ) : null}
            </div>

            {/* ── Current ──────────────────────────────────────────────── */}
            {teaching.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nobody teaches this class yet"
                description="Assign a teacher to a subject above. Until you do, no teacher can set work or see the register."
                className="border-0"
              />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                    {row.subject ? (
                      <SubjectBadge code={row.subject.code} color={row.subject.color} size="sm" />
                    ) : null}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {row.teacher?.user?.full_name ?? 'Unnamed teacher'}
                      </span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {row.subject?.name ?? 'Subject'}
                      </span>
                    </span>

                    {row.is_lead ? <Badge variant="brand">Lead</Badge> : null}

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${row.teacher?.user?.full_name ?? 'teacher'} from ${row.subject?.name ?? 'subject'}`}
                      onClick={() => {
                        setRemoving({
                          id: row.id,
                          label: `${row.teacher?.user?.full_name ?? 'This teacher'} from ${row.subject?.name ?? 'this subject'}`,
                        });
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Remove this assignment?"
        description={`${removing?.label ?? 'The teacher'} loses access to this class — its register, its marks and its work. Lessons and assignments they already wrote are kept, and so are the marks they recorded.`}
        confirmLabel="Remove assignment"
        destructive
        isPending={unassign.isPending}
        onConfirm={() => {
          if (!removing) return;
          unassign.mutate(removing.id, {
            onSuccess: () => {
              setRemoving(null);
            },
          });
        }}
      />
    </>
  );
}
