import { useEffect, useState } from 'react';
import { BookMarked, Search } from 'lucide-react';

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
import { Select } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { cn } from '@/shared/utils/cn';
import { truncate } from '@/shared/utils/format';
import type { QuestionType } from '@/shared/types';

import { useQuestionBank, useQuestionMutations } from '../hooks/use-quizzes';
import { QUESTION_TYPES } from '../lib/question-shapes';

/**
 * Pick questions from the school's bank onto this paper.
 *
 * Scoped to the paper's subject by default — a Physics test wants Physics
 * questions, and a bank browser that opens on every subject in the school is a
 * browser nobody uses twice. The filter can be cleared.
 *
 * Items are copied, not linked. See `addBankQuestionsToQuiz`.
 */
export function QuestionBankDialog({
  open,
  onOpenChange,
  quizId,
  schoolId,
  subjectId,
  nextSortOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quizId: string;
  schoolId: string;
  subjectId: string;
  nextSortOrder: number;
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [thisSubjectOnly, setThisSubjectOnly] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);

  const debounced = useDebouncedValue(search, 250);
  const { addFromBank } = useQuestionMutations(quizId);

  const bank = useQuestionBank(
    {
      subjectId: thisSubjectOnly ? subjectId : undefined,
      search: debounced || undefined,
      questionType: (type || undefined) as QuestionType | undefined,
    },
    open,
  );

  useEffect(() => {
    if (open) setChosen([]);
  }, [open]);

  const items = bank.data ?? [];
  const selected = items.filter((item) => chosen.includes(item.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Question bank</DialogTitle>
          <DialogDescription>
            Questions your colleagues have saved. Chosen questions are copied onto this paper, so
            editing them here never changes the bank.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Search the bank"
                className="pl-10"
                aria-label="Search the question bank"
              />
            </div>

            <Select
              value={type}
              onChange={(event) => {
                setType(event.target.value);
              }}
              className="w-auto"
              aria-label="Filter by question type"
              options={[
                { value: '', label: 'Any type' },
                ...QUESTION_TYPES.map((entry) => ({ value: entry.value, label: entry.label })),
              ]}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
            <input
              type="checkbox"
              checked={thisSubjectOnly}
              onChange={(event) => {
                setThisSubjectOnly(event.target.checked);
              }}
              className="size-3.5 accent-brand"
            />
            This subject only
          </label>

          {bank.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[13px] text-ink-3">
              Nothing in the bank yet. Tick &ldquo;also save a copy&rdquo; when you write a question
              and it lands here for next time.
            </p>
          ) : (
            <ul className="max-h-[22rem] space-y-2 overflow-y-auto">
              {items.map((item) => {
                const picked = chosen.includes(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setChosen((current) =>
                          picked ? current.filter((id) => id !== item.id) : [...current, item.id],
                        );
                      }}
                      aria-pressed={picked}
                      className={cn(
                        'w-full cursor-pointer rounded-xl border p-3 text-left transition-colors',
                        picked
                          ? 'border-brand-border bg-brand-soft/40'
                          : 'border-border hover:bg-surface-2',
                      )}
                    >
                      <span className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-[13.5px] font-medium text-ink">
                          {truncate(item.prompt, 140)}
                        </span>
                        <Badge variant="neutral">{item.points}</Badge>
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">
                          {QUESTION_TYPES.find((entry) => entry.value === item.question_type)
                            ?.label ?? item.question_type}
                        </Badge>
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="neutral">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogBody>

        <DialogFooter>
          <span className="mr-auto text-[13px] text-ink-3">
            {chosen.length} selected
            {selected.length > 0
              ? ` · ${selected.reduce((sum, item) => sum + item.points, 0)} marks`
              : ''}
          </span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selected.length === 0}
            loading={addFromBank.isPending}
            onClick={() => {
              addFromBank.mutate(
                { quizId, schoolId, items: selected, startAt: nextSortOrder },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            <BookMarked className="size-4" aria-hidden />
            Add to paper
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
