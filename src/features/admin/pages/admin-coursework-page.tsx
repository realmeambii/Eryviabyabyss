import { useMemo, useState } from 'react';
import { ClipboardCheck, ClipboardList } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { Input } from '@/shared/components/ui/input';
import { className as formatClassName, formatDate } from '@/shared/utils/format';

import { useClasses, useSubjects } from '../hooks/use-admin-academics';
import { useCoursework } from '../hooks/use-coursework';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Coursework oversight
 * ═══════════════════════════════════════════════════════════════════════════
 *  What has been set across the school, and by whom. Deliberately read only.
 *
 *  An administrator can already *see* every assignment and quiz —
 *  `assignments_select_authorised` ends in `or app.is_admin()` — so this screen
 *  adds no access. What it adds is the question the office actually asks in week
 *  three: which classes have had nothing set, and which teacher has published
 *  nothing all term.
 *
 *  No editing, and that is a deliberate line rather than a missing feature. A
 *  head who can rewrite a teacher's assignment is a head who gets asked to, and
 *  the person who set the work is the person who should change it. The RLS
 *  agrees: `assignments_update_teacher` does not have an admin branch.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function AdminCourseworkPage({ kind }: { kind: 'assignments' | 'quizzes' }) {
  const { currentSession } = useCurrentUser();
  const classes = useClasses();
  const subjects = useSubjects();

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [search, setSearch] = useState('');

  const debounced = useDebouncedValue(search, 250);

  const coursework = useCoursework({
    kind,
    classId: classId || undefined,
    subjectId: subjectId || undefined,
  });

  const rows = useMemo(() => {
    const all = coursework.data ?? [];
    const term = debounced.trim().toLowerCase();
    if (term === '') return all;
    return all.filter(
      (row) =>
        row.title.toLowerCase().includes(term) ||
        (row.teacherName ?? '').toLowerCase().includes(term),
    );
  }, [coursework.data, debounced]);

  const isAssignments = kind === 'assignments';

  if (!currentSession) {
    return (
      <EmptyState
        icon={isAssignments ? ClipboardList : ClipboardCheck}
        title="No current term"
        description="Set a current academic session first."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAssignments ? 'Assignments' : 'Tests & quizzes'}
        description={`Everything set across the school this term. Read only — the teacher who set the work is the one who changes it.`}
        actions={
          coursework.isPending ? null : (
            <Badge variant="neutral">
              {rows.length} {rows.length === 1 ? 'item' : 'items'}
            </Badge>
          )
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ac-class">Class</Label>
          <Select
            id="ac-class"
            className="w-44"
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
            }}
            options={[
              { value: '', label: 'Every class' },
              ...(classes.data ?? []).map((entry) => ({
                value: entry.id,
                label: formatClassName(entry.name, entry.arm),
              })),
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ac-subject">Subject</Label>
          <Select
            id="ac-subject"
            className="w-48"
            value={subjectId}
            onChange={(event) => {
              setSubjectId(event.target.value);
            }}
            options={[
              { value: '', label: 'Every subject' },
              ...(subjects.data ?? []).map((entry) => ({ value: entry.id, label: entry.name })),
            ]}
          />
        </div>

        <div className="min-w-52 flex-1 space-y-1.5">
          <Label htmlFor="ac-search">Search</Label>
          <Input
            id="ac-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Title or teacher"
          />
        </div>
      </div>

      {coursework.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={isAssignments ? ClipboardList : ClipboardCheck}
          title="Nothing to show"
          description={
            classId || subjectId || debounced
              ? 'Nothing matches these filters.'
              : `No ${isAssignments ? 'assignments have' : 'tests have'} been set this term.`
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-ink">{row.title}</p>
                    <p className="text-[12.5px] text-ink-3">
                      {row.className} · {row.subjectName}
                      {row.teacherName ? ` · ${row.teacherName}` : ''}
                      {row.dueAt ? ` · due ${formatDate(row.dueAt)}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={row.status === 'published' ? 'success' : 'neutral'}>
                      {row.status}
                    </Badge>
                    <span className="text-[12.5px] text-ink-3">
                      {row.responses} {isAssignments ? 'handed in' : 'sat'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
