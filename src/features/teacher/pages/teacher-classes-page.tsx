import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search, Users } from 'lucide-react';

import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { CLASS_LEVELS } from '@/shared/lib/constants';
import { className as formatClassName } from '@/shared/utils/format';

import type { MyClass } from '../api/teacher.service';
import { useTeacherScope } from '../hooks/use-teacher-scope';

/**
 * The classes assigned to this teacher.
 *
 * Filtered and paged in the browser rather than the database. A teacher's
 * scope is at most a couple of dozen classes and it already arrives in the
 * single query every teacher screen shares — so a round trip per keystroke
 * would be slower *and* would re-fetch data the client is holding. The admin
 * student register makes the opposite call for the opposite reason: thousands
 * of rows that must never all be in memory at once.
 */

const PER_PAGE = 9;

const LEVELS = CLASS_LEVELS.map((item) => ({ value: String(item.value), label: item.label }));

export default function TeacherClassesPage() {
  const scope = useTeacherScope();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [page, setPage] = useState(1);

  const debounced = useDebouncedValue(search, 250);

  const filtered = useMemo(() => {
    const term = debounced.trim().toLowerCase();

    return scope.classes.filter((row) => {
      if (level && String(row.level) !== level) return false;
      if (subjectId && !row.subjects.some((subject) => subject.id === subjectId)) return false;
      if (term === '') return true;

      return (
        formatClassName(row.name, row.arm).toLowerCase().includes(term) ||
        (row.room ?? '').toLowerCase().includes(term) ||
        row.subjects.some(
          (subject) =>
            subject.name.toLowerCase().includes(term) || subject.code.toLowerCase().includes(term),
        )
      );
    });
  }, [scope.classes, debounced, level, subjectId]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // Clamped rather than reset: deleting the last row of page 3 should land on
  // page 2, not throw the teacher back to the top of the list.
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const resetTo = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My classes"
        description={
          scope.isPending
            ? 'The classes and subjects assigned to you this term.'
            : `${scope.classes.length} ${scope.classes.length === 1 ? 'class' : 'classes'} · ${scope.subjects.length} ${scope.subjects.length === 1 ? 'subject' : 'subjects'} this term`
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[15rem] flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => {
              resetTo(() => {
                setSearch(event.target.value);
              });
            }}
            placeholder="Search by class, subject or room"
            className="pl-10"
            aria-label="Search classes"
          />
        </div>

        <Select
          value={level}
          onChange={(event) => {
            resetTo(() => {
              setLevel(event.target.value);
            });
          }}
          className="w-auto"
          aria-label="Filter by year group"
          options={[{ value: '', label: 'All year groups' }, ...LEVELS]}
        />

        <Select
          value={subjectId}
          onChange={(event) => {
            resetTo(() => {
              setSubjectId(event.target.value);
            });
          }}
          className="w-auto"
          aria-label="Filter by subject"
          options={[
            { value: '', label: 'All subjects' },
            ...scope.subjects.map((subject) => ({ value: subject.id, label: subject.name })),
          ]}
        />
      </div>

      {scope.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      ) : scope.error ? (
        <EmptyState
          icon={Users}
          title="Could not load your classes"
          description={scope.error.message}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={scope.isUnassigned ? 'No classes assigned yet' : 'Nothing matches those filters'}
          description={
            scope.isUnassigned
              ? 'An administrator has not put you against any class this term.'
              : 'Try a different year group or subject.'
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((row) => (
              <ClassCard key={row.id} row={row} />
            ))}
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-ink-3">
                Page {safePage} of {pageCount} · {filtered.length} in total
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => {
                    setPage(safePage - 1);
                  }}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={safePage >= pageCount}
                  onClick={() => {
                    setPage(safePage + 1);
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

function ClassCard({ row }: { row: MyClass }) {
  return (
    <Link to={`/teacher/classes/${row.id}`} className="group block">
      <Card className="h-full transition-colors hover:border-brand-border">
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[17px] font-extrabold tracking-tight text-ink transition-colors group-hover:text-brand">
                {formatClassName(row.name, row.arm)}
              </p>
              <p className="pt-0.5 text-[12.5px] text-ink-3">
                {row.room ? `Room ${row.room}` : 'No room set'} · capacity {row.capacity}
              </p>
            </div>
            {row.isLead ? <Badge variant="brand">Lead</Badge> : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {row.subjects.map((subject) => (
              <SubjectBadge key={subject.id} code={subject.code} color={subject.color} size="sm" />
            ))}
          </div>

          <p className="text-[12.5px] text-ink-2">
            {row.subjects.length === 1
              ? row.subjects[0]?.name
              : `${row.subjects.length} subjects with this class`}
          </p>

          <span className="flex items-center gap-1 text-[13px] font-semibold text-brand">
            Open class
            <ChevronRight className="size-3.5" aria-hidden />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
