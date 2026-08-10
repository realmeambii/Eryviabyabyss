import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  Library,
  Search,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { useAuth } from '@/features/auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { queryKeys } from '@/shared/lib/query-keys';
import { cn } from '@/shared/utils/cn';
import type { AppRole } from '@/shared/types';

import { globalSearch, type SearchHit, type SearchKind } from '../api/search.service';

/**
 * Search everything the caller can see.
 *
 * One RPC does the work and each table's own RLS scopes its own branch, so
 * this component never decides what a role may find — a pupil searching for a
 * classmate gets nothing back because `students_select_authorised` returns
 * nothing, not because the UI filtered it.
 *
 * Where a hit *goes* is a different question, and that one is the UI's: the
 * same lesson is `/teacher/lessons/x` to its author and `/student/subjects/y`
 * to the class, so the destination is resolved per role below.
 */

const KIND_META: Record<SearchKind, { label: string; icon: LucideIcon }> = {
  student: { label: 'Pupils', icon: GraduationCap },
  class: { label: 'Classes', icon: Users },
  subject: { label: 'Subjects', icon: BookOpen },
  assignment: { label: 'Assignments', icon: ClipboardList },
  lesson: { label: 'Lessons', icon: Library },
  quiz: { label: 'Quizzes and tests', icon: ClipboardCheck },
};

const ORDER: SearchKind[] = ['student', 'class', 'subject', 'assignment', 'quiz', 'lesson'];

/**
 * Where a hit leads, per role.
 *
 * Returns null when a role has no screen for that kind — a pupil has no class
 * page, so a class hit is shown without being a dead link.
 *
 * An administrator has list screens rather than record screens for people,
 * classes and subjects, so those carry `?q=` and the list arrives filtered.
 * Landing on an unfiltered page of two thousand pupils would look like the
 * search had worked and then lost the pupil.
 */
function destinationFor(hit: SearchHit, role: AppRole): string | null {
  const base = role === 'administrator' ? '/admin' : `/${role}`;
  const filtered = (path: string) => `${path}?q=${encodeURIComponent(hit.title)}`;

  switch (hit.kind) {
    case 'student':
      if (role === 'teacher') return `/teacher/students/${hit.id}`;
      if (role === 'administrator') return filtered('/admin/students');
      return null;
    case 'class':
      if (role === 'teacher') return `/teacher/classes/${hit.id}`;
      if (role === 'administrator') return filtered('/admin/classes');
      return null;
    case 'subject':
      if (role === 'teacher') return `/teacher/subjects/${hit.id}`;
      if (role === 'student') return `/student/subjects/${hit.id}`;
      if (role === 'administrator') return filtered('/admin/subjects');
      return null;
    case 'assignment':
      if (role === 'teacher') return `/teacher/assignments/${hit.id}`;
      if (role === 'student') return `/student/assignments/${hit.id}`;
      return `${base}/assignments`;
    case 'quiz':
      if (role === 'teacher') return `/teacher/quizzes/${hit.id}`;
      if (role === 'student') return `/student/quizzes/${hit.id}`;
      return `${base}/quizzes`;
    case 'lesson':
      if (role === 'teacher') return `/teacher/lessons/${hit.id}`;
      return null;
  }
}

export function SearchDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: AppRole;
}) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);

  const debounced = useDebouncedValue(term, 250);

  useEffect(() => {
    if (open) {
      setTerm('');
      setActive(0);
    }
  }, [open]);

  const results = useQuery({
    queryKey: queryKeys.search(debounced.trim()),
    queryFn: () => globalSearch(debounced.trim()),
    // Two characters is the shortest term worth a round trip; one matches
    // half the school.
    enabled: isAuthenticated && open && debounced.trim().length >= 2,
    staleTime: 30_000,
  });

  const hits = useMemo(() => results.data ?? [], [results.data]);

  /** Grouped for display, but kept flat for the keyboard. */
  const grouped = useMemo(
    () =>
      ORDER.map((kind) => [kind, hits.filter((hit) => hit.kind === kind)] as const).filter(
        ([, rows]) => rows.length > 0,
      ),
    [hits],
  );

  const flat = useMemo(() => grouped.flatMap(([, rows]) => rows), [grouped]);

  useEffect(() => {
    setActive(0);
  }, [flat.length]);

  const go = (hit: SearchHit) => {
    const to = destinationFor(hit, role);
    if (!to) return;
    onOpenChange(false);
    void navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0" showClose={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>
            Search pupils, classes, subjects, assignments, lessons and quizzes.
          </DialogDescription>
        </DialogHeader>

        <div className="relative border-b border-border">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <input
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((current) => Math.min(flat.length - 1, current + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((current) => Math.max(0, current - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const hit = flat[active];
                if (hit) go(hit);
              }
            }}
            placeholder="Search pupils, classes, assignments…"
            aria-label="Search"
            autoFocus
            className="h-14 w-full bg-transparent pr-4 pl-11 text-[15px] text-ink outline-none placeholder:text-ink-3"
          />
        </div>

        <div className="max-h-[24rem] overflow-y-auto p-2">
          {debounced.trim().length < 2 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-3">
              Type at least two characters.
            </p>
          ) : results.isPending ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : flat.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-3">
              Nothing matches &ldquo;{debounced.trim()}&rdquo;.
            </p>
          ) : (
            <>
              {grouped.map(([kind, rows]) => {
                const meta = KIND_META[kind];
                const Icon = meta.icon;

                return (
                  <div key={kind} className="pb-2">
                    <p className="px-3 py-1.5 text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                      {meta.label}
                    </p>
                    <ul>
                      {rows.map((hit) => {
                        const index = flat.indexOf(hit);
                        const reachable = destinationFor(hit, role) !== null;

                        return (
                          <li key={`${hit.kind}-${hit.id}`}>
                            <button
                              type="button"
                              disabled={!reachable}
                              onMouseEnter={() => {
                                setActive(index);
                              }}
                              onClick={() => {
                                go(hit);
                              }}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                                reachable ? 'cursor-pointer' : 'cursor-default opacity-60',
                                index === active && reachable && 'bg-surface-2',
                              )}
                            >
                              <Icon className="size-4 shrink-0 text-ink-3" aria-hidden />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-medium text-ink">
                                  {hit.title}
                                </span>
                                {hit.subtitle ? (
                                  <span className="block truncate text-[12px] text-ink-3">
                                    {hit.subtitle}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}

              <p className="border-t border-border px-3 pt-2 text-[11.5px] text-ink-3">
                ↑↓ to move · Enter to open · results are limited to what you can see
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
