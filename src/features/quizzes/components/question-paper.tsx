import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Select } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/utils/cn';
import type { QuizPaperQuestion } from '@/shared/types';

/**
 * One question, as a candidate answers it.
 *
 * The answer is always an array of strings, whatever the type, because that is
 * what `submit_quiz_attempt()` marks and what `quiz_attempts.responses` stores:
 * `{"<question_id>": ["a"]}`. Keeping the shape uniform here means the marker
 * never has to guess what a client meant.
 *
 *   multiple_choice / true_false   ["<optionId>"]
 *   multiple_select                ["<optionId>", …] in any order
 *   short_answer / fill_blank      ["<typed text>"]
 *   matching                       ["<optionId>:<chosen match>", …]
 *   essay                          ["<typed text>"] — marked by a teacher
 */

interface QuestionPaperProps {
  question: QuizPaperQuestion;
  index: number;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function QuestionPaper({
  question,
  index,
  value,
  onChange,
  disabled = false,
}: QuestionPaperProps) {
  const options = question.options ?? [];

  const single = (optionId: string) => {
    onChange([optionId]);
  };

  const multi = (optionId: string) => {
    onChange(
      value.includes(optionId) ? value.filter((id) => id !== optionId) : [...value, optionId],
    );
  };

  /** Matching answers are stored as "<optionId>:<match>"; read one back. */
  const matchFor = (optionId: string) =>
    value.find((entry) => entry.startsWith(`${optionId}:`))?.slice(optionId.length + 1) ?? '';

  const setMatch = (optionId: string, match: string) => {
    const without = value.filter((entry) => !entry.startsWith(`${optionId}:`));
    onChange(match === '' ? without : [...without, `${optionId}:${match}`]);
  };

  return (
    <li className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-3 font-mono text-[12px] font-bold text-ink-2">
            {index + 1}
          </span>
          <p className="text-[14.5px] leading-relaxed font-medium whitespace-pre-wrap text-ink">
            {question.prompt}
          </p>
        </div>
        <Badge variant="neutral">
          {question.points} {question.points === 1 ? 'mark' : 'marks'}
        </Badge>
      </div>

      <div className="mt-4 pl-10">
        {/* ── Pick one, or pick several ─────────────────────────────────── */}
        {question.question_type === 'multiple_choice' ||
        question.question_type === 'true_false' ||
        question.question_type === 'multiple_select' ? (
          <ul className="space-y-2">
            {options.map((option) => {
              const chosen = value.includes(option.id);
              const many = question.question_type === 'multiple_select';

              return (
                <li key={option.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors',
                      chosen
                        ? 'border-brand-border bg-brand-soft/40'
                        : 'border-border hover:bg-surface-2',
                      disabled && 'pointer-events-none opacity-60',
                    )}
                  >
                    <input
                      type={many ? 'checkbox' : 'radio'}
                      name={question.id}
                      checked={chosen}
                      disabled={disabled}
                      onChange={() => {
                        if (many) multi(option.id);
                        else single(option.id);
                      }}
                      className="size-4 shrink-0 accent-brand"
                    />
                    <span className="text-[14px] text-ink">{option.label}</span>
                  </label>
                </li>
              );
            })}
            {question.question_type === 'multiple_select' ? (
              <p className="pt-1 text-[12px] text-ink-3">
                Choose every correct answer — all of them must be right for the mark.
              </p>
            ) : null}
          </ul>
        ) : null}

        {/* ── Matching ──────────────────────────────────────────────────── */}
        {question.question_type === 'matching' ? (
          <div className="space-y-2">
            <ul className="space-y-2">
              {options.map((option) => (
                <li key={option.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[9rem] flex-1 text-[14px] text-ink">{option.label}</span>
                  <span className="text-ink-3" aria-hidden>
                    →
                  </span>
                  <Select
                    value={matchFor(option.id)}
                    disabled={disabled}
                    onChange={(event) => {
                      setMatch(option.id, event.target.value);
                    }}
                    placeholder="Choose"
                    className="w-auto min-w-[11rem]"
                    aria-label={`Match for ${option.label}`}
                    options={(question.match_pool ?? []).map((match) => ({
                      value: match,
                      label: match,
                    }))}
                  />
                </li>
              ))}
            </ul>
            <p className="pt-1 text-[12px] text-ink-3">Every pair must be right for the mark.</p>
          </div>
        ) : null}

        {/* ── Typed ─────────────────────────────────────────────────────── */}
        {question.question_type === 'short_answer' || question.question_type === 'fill_blank' ? (
          <div className="space-y-1.5">
            <Input
              value={value[0] ?? ''}
              disabled={disabled}
              onChange={(event) => {
                onChange(event.target.value === '' ? [] : [event.target.value]);
              }}
              placeholder="Your answer"
              aria-label={`Answer to question ${index + 1}`}
              className="max-w-md"
            />
            {question.question_type === 'fill_blank' ? (
              <p className="text-[12px] text-ink-3">Fill the blank shown as ___ above.</p>
            ) : null}
          </div>
        ) : null}

        {question.question_type === 'essay' ? (
          <div className="space-y-1.5">
            <Textarea
              value={value[0] ?? ''}
              disabled={disabled}
              onChange={(event) => {
                onChange(event.target.value === '' ? [] : [event.target.value]);
              }}
              rows={8}
              placeholder="Write your answer"
              aria-label={`Answer to question ${index + 1}`}
            />
            <p className="text-[12px] text-ink-3">
              Your teacher marks this one by hand, so your result waits until they have.
            </p>
          </div>
        ) : null}
      </div>
    </li>
  );
}
