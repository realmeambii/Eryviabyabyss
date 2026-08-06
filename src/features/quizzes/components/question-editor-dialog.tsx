import { useEffect, useState } from 'react';
import { BookMarked, Plus, X } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
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
import { Textarea } from '@/shared/components/ui/textarea';
import { errorMessage } from '@/shared/lib/errors';
import { cn } from '@/shared/utils/cn';
import type { QuestionType, QuizQuestion } from '@/shared/types';

import { useQuestionBankMutations, useQuestionMutations } from '../hooks/use-quizzes';
import {
  QUESTION_TYPES,
  TRUE_FALSE_OPTIONS,
  readAnswers,
  readOptions,
  toStoredShape,
  usesOptions,
  usesTypedAnswers,
  validateQuestion,
  type ChoiceOption,
} from '../lib/question-shapes';

/**
 * Write or edit one question, of any of the seven types.
 *
 * A single dialog rather than seven, because six of the fields are shared and
 * changing type mid-thought is normal — a teacher writes a multiple choice,
 * realises two answers are defensible and switches to multiple select. Swapping
 * component would lose the prompt they had just typed.
 *
 * The type switch keeps whatever still applies. Options survive a move between
 * the option-based types; typed answers survive between short answer and fill
 * in the blank. Anything that cannot carry across is dropped rather than
 * silently reinterpreted — an option id is not an accepted answer string.
 */

function newOption(): ChoiceOption {
  return { id: crypto.randomUUID().slice(0, 8), label: '', match: '' };
}

export function QuestionEditorDialog({
  open,
  onOpenChange,
  quizId,
  schoolId,
  subjectId,
  question,
  nextSortOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quizId: string;
  schoolId: string;
  subjectId: string;
  /** Null to add a new question. */
  question: QuizQuestion | null;
  nextSortOrder: number;
}) {
  const { teacherId } = useCurrentUser();
  const { create, update } = useQuestionMutations(quizId);
  const bank = useQuestionBankMutations();

  const [type, setType] = useState<QuestionType>('multiple_choice');
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState<ChoiceOption[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [points, setPoints] = useState('1');
  const [explanation, setExplanation] = useState('');
  const [alsoSaveToBank, setAlsoSaveToBank] = useState(false);
  const [touched, setTouched] = useState(false);

  const isEdit = question !== null;

  useEffect(() => {
    if (!open) return;

    setTouched(false);
    setAlsoSaveToBank(false);
    create.reset();
    update.reset();

    if (question) {
      setType(question.question_type);
      setPrompt(question.prompt);
      setOptions(readOptions(question.options));
      setAnswers(readAnswers(question.correct_answers));
      setPoints(question.points.toString());
      setExplanation(question.explanation ?? '');
    } else {
      setType('multiple_choice');
      setPrompt('');
      setOptions([newOption(), newOption()]);
      setAnswers([]);
      setPoints('1');
      setExplanation('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, question?.id]);

  /** Carry across what still means the same thing; drop the rest. */
  const changeType = (next: QuestionType) => {
    const wasOptions = usesOptions(type);
    const nowOptions = usesOptions(next);
    const wasTyped = usesTypedAnswers(type);
    const nowTyped = usesTypedAnswers(next);

    if (next === 'true_false') {
      setOptions(TRUE_FALSE_OPTIONS);
      setAnswers([]);
    } else if (nowOptions && !wasOptions) {
      setOptions([newOption(), newOption()]);
      setAnswers([]);
    } else if (nowOptions && type === 'true_false') {
      // Leaving true/false: its fixed options are not a question's options.
      setOptions([newOption(), newOption()]);
      setAnswers([]);
    } else if (!nowOptions) {
      setOptions([]);
      // Option ids are meaningless as typed answers.
      if (!nowTyped || !wasTyped) setAnswers([]);
    } else if (next === 'multiple_choice' && answers.length > 1) {
      // Narrowing from multiple select: keep the first, it is the likely intent.
      setAnswers(answers.slice(0, 1));
    }

    setType(next);
  };

  const error = validateQuestion({
    type,
    prompt,
    options,
    answers,
    points: Number(points),
  });

  const isPending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;

  const submit = () => {
    setTouched(true);
    if (error) return;

    const stored = toStoredShape({ type, options, answers });
    const payload = {
      question_type: type,
      prompt: prompt.trim(),
      options: stored.options,
      correct_answers: stored.correct_answers,
      points: Number(points),
      explanation: explanation.trim() || null,
    };

    const done = {
      onSuccess: () => {
        if (alsoSaveToBank && teacherId) {
          // Best effort and deliberately not awaited into the same toast: the
          // question is on the paper either way, and a bank failure should not
          // read as though the question was not added.
          bank.save.mutate({
            school_id: schoolId,
            subject_id: subjectId,
            created_by: teacherId,
            question_type: type,
            prompt: payload.prompt,
            options: stored.options,
            correct_answers: stored.correct_answers,
            points: Number(points),
            explanation: payload.explanation,
          });
        }
        onOpenChange(false);
      },
    };

    if (isEdit) {
      update.mutate({ id: question.id, patch: payload }, done);
      return;
    }

    create.mutate(
      { ...payload, quiz_id: quizId, school_id: schoolId, sort_order: nextSortOrder },
      done,
    );
  };

  const toggleAnswer = (optionId: string) => {
    if (type === 'multiple_select') {
      setAnswers((current) =>
        current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      );
      return;
    }
    setAnswers([optionId]);
  };

  const typeHint = QUESTION_TYPES.find((entry) => entry.value === type)?.hint;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit question' : 'New question'}</DialogTitle>
          <DialogDescription>{typeHint}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          {failure ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(failure)}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-1.5">
              <Label htmlFor="q-type">Type</Label>
              <Select
                id="q-type"
                value={type}
                onChange={(event) => {
                  changeType(event.target.value as QuestionType);
                }}
                options={QUESTION_TYPES.map((entry) => ({
                  value: entry.value,
                  label: entry.label,
                }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-points">Marks</Label>
              <Input
                id="q-points"
                type="number"
                min={0.5}
                step="0.5"
                value={points}
                onChange={(event) => {
                  setPoints(event.target.value);
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-prompt">Question</Label>
            <Textarea
              id="q-prompt"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
              }}
              rows={3}
              placeholder={
                type === 'fill_blank'
                  ? 'The powerhouse of the cell is the ___.'
                  : 'What is the derivative of x²?'
              }
              autoFocus
            />
            {type === 'fill_blank' ? (
              <p className="text-[12px] text-ink-3">
                Write <code className="rounded bg-surface-3 px-1">___</code> where the blank goes.
              </p>
            ) : null}
          </div>

          {/* ── Options ──────────────────────────────────────────────────── */}
          {usesOptions(type) ? (
            <div className="space-y-2">
              <Label>
                {type === 'matching' ? 'Pairs' : 'Options'}
                {type !== 'matching' ? (
                  <span className="pl-2 font-normal text-ink-3">
                    {type === 'multiple_select' ? 'tick every correct one' : 'tick the correct one'}
                  </span>
                ) : null}
              </Label>

              <ul className="space-y-2">
                {options.map((option, index) => (
                  <li key={option.id} className="flex items-center gap-2">
                    {type === 'matching' ? null : (
                      <input
                        type={type === 'multiple_select' ? 'checkbox' : 'radio'}
                        name="correct-option"
                        checked={answers.includes(option.id)}
                        onChange={() => {
                          toggleAnswer(option.id);
                        }}
                        aria-label={`Option ${index + 1} is correct`}
                        className="size-4 shrink-0 accent-brand"
                      />
                    )}

                    <Input
                      value={option.label}
                      disabled={type === 'true_false'}
                      onChange={(event) => {
                        setOptions((current) =>
                          current.map((entry) =>
                            entry.id === option.id
                              ? { ...entry, label: event.target.value }
                              : entry,
                          ),
                        );
                      }}
                      placeholder={type === 'matching' ? 'Item' : `Option ${index + 1}`}
                      aria-label={`Option ${index + 1}`}
                    />

                    {type === 'matching' ? (
                      <>
                        <span className="shrink-0 text-ink-3" aria-hidden>
                          →
                        </span>
                        <Input
                          value={option.match ?? ''}
                          onChange={(event) => {
                            setOptions((current) =>
                              current.map((entry) =>
                                entry.id === option.id
                                  ? { ...entry, match: event.target.value }
                                  : entry,
                              ),
                            );
                          }}
                          placeholder="Matches with"
                          aria-label={`Match for item ${index + 1}`}
                        />
                      </>
                    ) : null}

                    {type === 'true_false' ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={options.length <= 2}
                        aria-label={`Remove option ${index + 1}`}
                        onClick={() => {
                          setOptions((current) =>
                            current.filter((entry) => entry.id !== option.id),
                          );
                          setAnswers((current) => current.filter((id) => id !== option.id));
                        }}
                      >
                        <X className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>

              {type === 'true_false' ? null : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setOptions((current) => [...current, newOption()]);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add {type === 'matching' ? 'pair' : 'option'}
                </Button>
              )}

              {type === 'matching' ? (
                <p className="text-[12px] text-ink-3">
                  Pupils see the items with the matches shuffled. Every pair must be right for the
                  mark — matching is all or nothing.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* ── Typed answers ────────────────────────────────────────────── */}
          {usesTypedAnswers(type) ? (
            <div className="space-y-2">
              <Label>Accepted answers</Label>
              <ul className="space-y-2">
                {answers.map((answer, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Input
                      value={answer}
                      onChange={(event) => {
                        setAnswers((current) =>
                          current.map((entry, position) =>
                            position === index ? event.target.value : entry,
                          ),
                        );
                      }}
                      placeholder="mitochondrion"
                      aria-label={`Accepted answer ${index + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove accepted answer ${index + 1}`}
                      onClick={() => {
                        setAnswers((current) =>
                          current.filter((_, position) => position !== index),
                        );
                      }}
                    >
                      <X className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAnswers((current) => [...current, '']);
                }}
              >
                <Plus className="size-4" aria-hidden />
                Add an accepted answer
              </Button>

              <p className="text-[12px] text-ink-3">
                Any one of these earns the mark. Case and surrounding spaces are ignored, so
                &ldquo;Mitochondrion&rdquo; and &ldquo;mitochondrion&rdquo; both pass.
              </p>
            </div>
          ) : null}

          {type === 'essay' ? (
            <Alert variant="info">
              <AlertDescription>
                Essays are never marked automatically. Papers containing one arrive in your review
                queue for a mark.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="q-explanation">Explanation</Label>
            <Textarea
              id="q-explanation"
              value={explanation}
              onChange={(event) => {
                setExplanation(event.target.value);
              }}
              rows={2}
              placeholder="Shown to pupils with their result. Optional."
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 border-t border-border pt-4 text-[13px] font-medium text-ink-2">
            <input
              type="checkbox"
              checked={alsoSaveToBank}
              onChange={(event) => {
                setAlsoSaveToBank(event.target.checked);
              }}
              className="size-3.5 accent-brand"
            />
            <BookMarked className="size-4 text-ink-3" aria-hidden />
            Also save a copy to the question bank
          </label>

          {touched && error ? (
            <p className={cn('text-[12.5px] font-medium text-danger')}>{error}</p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <div className="mr-auto">
            <Badge variant="neutral">{points || 0} marks</Badge>
          </div>
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
          <Button type="button" onClick={submit} loading={isPending}>
            {isEdit ? 'Save question' : 'Add question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
