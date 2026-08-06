import { GripVertical, Plus, X } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { cn } from '@/shared/utils/cn';
import type { RubricCriterion } from '@/shared/types';

/**
 * The grading rubric editor.
 *
 * The total is shown against the assignment's maximum but never enforced. A
 * rubric is normally drafted before the mark scheme is settled, and a builder
 * that refuses to save an unbalanced one pushes the teacher out of the editor
 * and into a notebook. The mismatch is surfaced as a hint instead — visible,
 * ignorable, and correct once they finish.
 *
 * Criteria are stored as a jsonb array on the assignment, read and written
 * whole. Order is array order; there is no sort key to drift out of step.
 */

interface RubricBuilderProps {
  value: RubricCriterion[];
  onChange: (next: RubricCriterion[]) => void;
  /** The assignment's max_score, for the running total. */
  maxScore: number;
  disabled?: boolean;
}

function newCriterion(): RubricCriterion {
  return {
    // `crypto.randomUUID` is available in every browser this app supports and
    // keeps React keys stable across reorders, which an index cannot.
    id: crypto.randomUUID(),
    criterion: '',
    points: 0,
    descriptor: '',
  };
}

export function RubricBuilder({ value, onChange, maxScore, disabled = false }: RubricBuilderProps) {
  const total = value.reduce((sum, row) => sum + (Number.isFinite(row.points) ? row.points : 0), 0);
  const mismatched = value.length > 0 && Math.abs(total - maxScore) > 0.001;

  const patch = (id: string, changes: Partial<RubricCriterion>) => {
    onChange(value.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;

    const next = [...value];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>Grading rubric</Label>
        {value.length > 0 ? (
          <span
            className={cn(
              'text-[12.5px] font-semibold',
              mismatched ? 'text-warning' : 'text-ink-3',
            )}
          >
            {total} / {maxScore} allocated
          </span>
        ) : null}
      </div>

      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-[12.5px] text-ink-3">
          No rubric. Marks are entered as a single score.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((row, index) => (
            <li key={row.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start gap-2">
                <div className="flex flex-col pt-1.5">
                  <button
                    type="button"
                    aria-label={`Move “${row.criterion || 'criterion'}” up`}
                    disabled={disabled || index === 0}
                    onClick={() => {
                      move(index, -1);
                    }}
                    className="cursor-pointer text-ink-3 hover:text-ink disabled:opacity-30"
                  >
                    <GripVertical className="size-3.5 rotate-90" aria-hidden />
                  </button>
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={row.criterion}
                      disabled={disabled}
                      onChange={(event) => {
                        patch(row.id, { criterion: event.target.value });
                      }}
                      placeholder="Working shown"
                      aria-label={`Criterion ${index + 1}`}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={row.points}
                      disabled={disabled}
                      onChange={(event) => {
                        patch(row.id, { points: Number(event.target.value) });
                      }}
                      className="w-24 shrink-0"
                      aria-label={`Points for criterion ${index + 1}`}
                    />
                  </div>

                  <Input
                    value={row.descriptor ?? ''}
                    disabled={disabled}
                    onChange={(event) => {
                      patch(row.id, { descriptor: event.target.value });
                    }}
                    placeholder="What earns full marks here (optional)"
                    aria-label={`Descriptor for criterion ${index + 1}`}
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`Remove criterion ${index + 1}`}
                  onClick={() => {
                    onChange(value.filter((entry) => entry.id !== row.id));
                  }}
                >
                  <X className="size-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mismatched ? (
        <p className="text-[12px] text-warning">
          The rubric totals {total} but the assignment is out of {maxScore}. That is allowed — the
          score you enter is what counts — but it is usually a slip.
        </p>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => {
          onChange([...value, newCriterion()]);
        }}
      >
        <Plus className="size-4" aria-hidden />
        Add criterion
      </Button>
    </div>
  );
}
