import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, Search } from 'lucide-react';

import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { className as formatClassName } from '@/shared/utils/format';

import { useTeacherScope } from '../hooks/use-teacher-scope';

/**
 * The subjects this teacher takes, and who they take them with.
 *
 * The inverse projection of My Classes over exactly the same scope query — a
 * teacher thinks in both directions ("what am I doing with JSS 1A" and "which
 * classes take my Physics"), and neither view costs a second request.
 */
export default function TeacherSubjectsPage() {
  const scope = useTeacherScope();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 250);

  const filtered = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    if (term === '') return scope.subjects;

    return scope.subjects.filter(
      (subject) =>
        subject.name.toLowerCase().includes(term) ||
        subject.code.toLowerCase().includes(term) ||
        subject.classes.some((row) =>
          formatClassName(row.name, row.arm).toLowerCase().includes(term),
        ),
    );
  }, [scope.subjects, debounced]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My subjects"
        description={
          scope.isPending
            ? 'The subjects assigned to you this term.'
            : `${scope.subjects.length} ${scope.subjects.length === 1 ? 'subject' : 'subjects'} across ${scope.classes.length} ${scope.classes.length === 1 ? 'class' : 'classes'}`
        }
      />

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
          placeholder="Search by subject or class"
          className="pl-10"
          aria-label="Search subjects"
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
          icon={BookOpen}
          title="Could not load your subjects"
          description={scope.error.message}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={scope.isUnassigned ? 'No subjects assigned yet' : 'Nothing matches'}
          description={
            scope.isUnassigned
              ? 'An administrator assigns you to a class and subject; both appear here once they have.'
              : `Nothing matches “${debounced}”.`
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((subject) => (
            <Link key={subject.id} to={`/teacher/subjects/${subject.id}`} className="group block">
              <Card className="h-full transition-colors hover:border-brand-border">
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <SubjectBadge code={subject.code} color={subject.color} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15.5px] font-extrabold tracking-tight text-ink transition-colors group-hover:text-brand">
                        {subject.name}
                      </p>
                      <p className="pt-0.5 text-[12.5px] text-ink-3">
                        {subject.classes.length}{' '}
                        {subject.classes.length === 1 ? 'class' : 'classes'}
                      </p>
                    </div>
                    {subject.is_core ? <Badge variant="neutral">Core</Badge> : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {subject.classes.map((row) => (
                      <Badge key={row.id} variant="outline">
                        {formatClassName(row.name, row.arm)}
                      </Badge>
                    ))}
                  </div>

                  <span className="flex items-center gap-1 text-[13px] font-semibold text-brand">
                    Open subject
                    <ChevronRight className="size-3.5" aria-hidden />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
