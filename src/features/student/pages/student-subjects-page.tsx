import { BookOpen, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { SubjectBadge } from '@/shared/components/subject-badge';
import { Badge } from '@/shared/components/ui/badge';
import { Card } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';

import { useStudentContext } from '../hooks/use-student-context';
import { useStudentSubjects } from '../hooks/use-student-data';

/**
 * The subjects a student takes this term.
 *
 * One query, one card per subject. Which subjects appear is decided by
 * `class_subjects` for the student's own class — RLS confines it, so there is
 * no filtering here beyond ordering.
 */
export default function StudentSubjectsPage() {
  const { className, isUnenrolled, isLoading: contextLoading } = useStudentContext();
  const { data: subjects, isPending, isError, error } = useStudentSubjects();

  const loading = contextLoading || isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My subjects"
        description={
          className
            ? `Everything you are taking in ${className} this term.`
            : 'Everything you are taking this term.'
        }
      />

      {isUnenrolled ? (
        <EmptyState
          icon={BookOpen}
          title="You are not in a class yet"
          description="The school office has created your account but has not placed you in a class. Your subjects will appear here once they do."
        />
      ) : null}

      {isError ? (
        <EmptyState
          icon={BookOpen}
          title="Could not load your subjects"
          description={error.message}
        />
      ) : null}

      {loading && !isUnenrolled ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Card key={index} className="flex items-center gap-4 p-4">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {!loading && subjects && subjects.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <Link
              key={subject.classSubjectId}
              to={`/student/subjects/${subject.subjectId}`}
              className="group"
            >
              <Card className="flex h-full items-center gap-4 p-4 transition-colors hover:border-brand-border">
                <SubjectBadge code={subject.code} color={subject.color} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink transition-colors group-hover:text-brand">
                    {subject.name}
                  </p>
                  <p className="truncate text-[12.5px] text-ink-3">
                    {subject.teacherName ?? 'Teacher not assigned'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {subject.isCore ? <Badge variant="brand">Core</Badge> : null}
                  <ChevronRight
                    className="size-4 text-ink-3 transition-colors group-hover:text-brand"
                    aria-hidden
                  />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}

      {!loading && !isUnenrolled && subjects && subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects yet"
          description="Your class has no subjects on its timetable for this term."
        />
      ) : null}
    </div>
  );
}
