import { useEffect, useMemo, useState } from 'react';

import { useCurrentUser } from '@/features/auth';
import { useTeacherScope } from '@/features/teacher';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
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
import { className as formatClassName } from '@/shared/utils/format';
import type { Quiz } from '@/shared/types';

import { useQuizMutations } from '../hooks/use-quizzes';

/**
 * The quiz itself — everything except the questions.
 *
 * Questions are authored on the builder page rather than in here: a paper is
 * written over several sittings, and a modal that holds twenty questions is a
 * modal nobody can leave.
 */

const ASSESSMENT_TYPES = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'test', label: 'Test' },
  { value: 'exam', label: 'Exam' },
  { value: 'classwork', label: 'Classwork' },
];

interface Draft {
  title: string;
  classId: string;
  subjectId: string;
  assessmentType: string;
  description: string;
  instructions: string;
  durationMinutes: string;
  passingPercentage: string;
  weightPercent: string;
  maxAttempts: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResultsImmediately: boolean;
  opensAt: string;
  closesAt: string;
}

const EMPTY: Draft = {
  title: '',
  classId: '',
  subjectId: '',
  assessmentType: 'quiz',
  description: '',
  instructions: '',
  durationMinutes: '30',
  passingPercentage: '50',
  weightPercent: '10',
  maxAttempts: '1',
  shuffleQuestions: true,
  shuffleOptions: true,
  showResultsImmediately: false,
  opensAt: '',
  closesAt: '',
};

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toTimestamp(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toLocalInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function QuizEditorDialog({
  open,
  onOpenChange,
  quiz,
  defaultClassId,
  defaultSubjectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quiz: Quiz | null;
  defaultClassId?: string;
  defaultSubjectId?: string;
  /** Sends the teacher straight to the builder — a quiz with no questions is not a paper. */
  onCreated?: (quiz: Quiz) => void;
}) {
  const { school, currentSession, teacherId } = useCurrentUser();
  const scope = useTeacherScope();
  const { create, update } = useQuizMutations();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [touched, setTouched] = useState(false);

  const isEdit = quiz !== null;

  useEffect(() => {
    if (!open) return;

    setTouched(false);
    create.reset();
    update.reset();

    setDraft(
      quiz
        ? {
            title: quiz.title,
            classId: quiz.class_id,
            subjectId: quiz.subject_id,
            assessmentType: quiz.assessment_type,
            description: quiz.description ?? '',
            instructions: quiz.instructions ?? '',
            durationMinutes: quiz.duration_minutes.toString(),
            passingPercentage: quiz.passing_percentage.toString(),
            weightPercent: Math.round(quiz.weight * 100).toString(),
            maxAttempts: quiz.max_attempts.toString(),
            shuffleQuestions: quiz.shuffle_questions,
            shuffleOptions: quiz.shuffle_options,
            showResultsImmediately: quiz.show_results_immediately,
            opensAt: toLocalInput(quiz.opens_at),
            closesAt: toLocalInput(quiz.closes_at),
          }
        : { ...EMPTY, classId: defaultClassId ?? '', subjectId: defaultSubjectId ?? '' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quiz?.id]);

  const subjectOptions = useMemo(() => {
    if (!draft.classId) return [];
    return scope.classes.find((row) => row.id === draft.classId)?.subjects ?? [];
  }, [scope.classes, draft.classId]);

  useEffect(() => {
    if (!draft.subjectId) return;
    if (subjectOptions.some((subject) => subject.id === draft.subjectId)) return;
    setDraft((current) => ({ ...current, subjectId: '' }));
  }, [subjectOptions, draft.subjectId]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  // `quizzes_window_order` rejects a close before an open.
  const windowInverted =
    draft.opensAt !== '' &&
    draft.closesAt !== '' &&
    new Date(draft.closesAt) <= new Date(draft.opensAt);

  const errors = {
    title: touched && draft.title.trim().length < 3 ? 'At least 3 characters.' : null,
    classId: touched && !draft.classId ? 'Choose a class.' : null,
    subjectId: touched && !draft.subjectId ? 'Choose a subject.' : null,
    window: windowInverted ? 'The paper cannot close before it opens.' : null,
  };

  const isValid =
    draft.title.trim().length >= 3 && Boolean(draft.classId && draft.subjectId) && !windowInverted;

  const isPending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;

  const submit = () => {
    setTouched(true);
    if (!isValid || !school || !currentSession) return;

    const shared = {
      title: draft.title.trim(),
      description: orNull(draft.description),
      instructions: orNull(draft.instructions),
      assessment_type: draft.assessmentType as Quiz['assessment_type'],
      duration_minutes: Number(draft.durationMinutes || 30),
      passing_percentage: Number(draft.passingPercentage || 50),
      weight: Math.min(1, Math.max(0, Number(draft.weightPercent) / 100)),
      max_attempts: Number(draft.maxAttempts || 1),
      shuffle_questions: draft.shuffleQuestions,
      shuffle_options: draft.shuffleOptions,
      show_results_immediately: draft.showResultsImmediately,
      opens_at: toTimestamp(draft.opensAt),
      closes_at: toTimestamp(draft.closesAt),
    };

    if (isEdit) {
      update.mutate(
        {
          id: quiz.id,
          patch: { ...shared, class_id: draft.classId, subject_id: draft.subjectId },
        },
        {
          onSuccess: () => {
            onOpenChange(false);
          },
        },
      );
      return;
    }

    create.mutate(
      {
        ...shared,
        class_id: draft.classId,
        subject_id: draft.subjectId,
        school_id: school.id,
        academic_session_id: currentSession.id,
        created_by: teacherId,
        status: 'draft',
      },
      {
        onSuccess: (created) => {
          onOpenChange(false);
          onCreated?.(created);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Quiz settings' : 'New quiz'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'How the paper is sat. Questions are edited on the paper itself.'
              : 'Set it up, then add the questions.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {failure ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(failure)}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="q-title">Title</Label>
            <Input
              id="q-title"
              value={draft.title}
              onChange={(event) => {
                set('title', event.target.value);
              }}
              placeholder="Cell biology — end of topic test"
              aria-invalid={errors.title !== null}
              autoFocus
            />
            {errors.title ? <p className="text-[12.5px] text-danger">{errors.title}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-class">Class</Label>
              <Select
                id="q-class"
                value={draft.classId}
                onChange={(event) => {
                  set('classId', event.target.value);
                }}
                placeholder="Choose"
                aria-invalid={errors.classId !== null}
                options={scope.classes.map((row) => ({
                  value: row.id,
                  label: formatClassName(row.name, row.arm),
                }))}
              />
              {errors.classId ? (
                <p className="text-[12.5px] text-danger">{errors.classId}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-subject">Subject</Label>
              <Select
                id="q-subject"
                value={draft.subjectId}
                onChange={(event) => {
                  set('subjectId', event.target.value);
                }}
                disabled={!draft.classId}
                placeholder={draft.classId ? 'Choose' : 'Class first'}
                aria-invalid={errors.subjectId !== null}
                options={subjectOptions.map((subject) => ({
                  value: subject.id,
                  label: subject.name,
                }))}
              />
              {errors.subjectId ? (
                <p className="text-[12.5px] text-danger">{errors.subjectId}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-kind">Kind</Label>
              <Select
                id="q-kind"
                value={draft.assessmentType}
                onChange={(event) => {
                  set('assessmentType', event.target.value);
                }}
                options={ASSESSMENT_TYPES}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-instructions">Instructions</Label>
            <Textarea
              id="q-instructions"
              value={draft.instructions}
              onChange={(event) => {
                set('instructions', event.target.value);
              }}
              rows={2}
              placeholder="Shown before the paper starts. Optional."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="q-duration">Minutes</Label>
              <Input
                id="q-duration"
                type="number"
                min={1}
                max={300}
                value={draft.durationMinutes}
                onChange={(event) => {
                  set('durationMinutes', event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-pass">Pass mark (%)</Label>
              <Input
                id="q-pass"
                type="number"
                min={0}
                max={100}
                value={draft.passingPercentage}
                onChange={(event) => {
                  set('passingPercentage', event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-weight">Weight (%)</Label>
              <Input
                id="q-weight"
                type="number"
                min={0}
                max={100}
                value={draft.weightPercent}
                onChange={(event) => {
                  set('weightPercent', event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-attempts">Attempts</Label>
              <Input
                id="q-attempts"
                type="number"
                min={1}
                max={10}
                value={draft.maxAttempts}
                onChange={(event) => {
                  set('maxAttempts', event.target.value);
                }}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="q-opens">Opens</Label>
              <Input
                id="q-opens"
                type="datetime-local"
                value={draft.opensAt}
                onChange={(event) => {
                  set('opensAt', event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-closes">Closes</Label>
              <Input
                id="q-closes"
                type="datetime-local"
                value={draft.closesAt}
                onChange={(event) => {
                  set('closesAt', event.target.value);
                }}
                aria-invalid={errors.window !== null}
              />
              {errors.window ? (
                <p className="text-[12.5px] text-danger">{errors.window}</p>
              ) : (
                <p className="text-[12px] text-ink-3">Leave both blank for no window.</p>
              )}
            </div>
          </div>

          <div className="space-y-2.5 border-t border-border pt-4">
            {[
              {
                key: 'shuffleQuestions' as const,
                label: 'Shuffle the question order',
                hint: 'Each pupil gets the paper in a different order.',
              },
              {
                key: 'shuffleOptions' as const,
                label: 'Shuffle the options',
                hint: 'Applies to multiple choice and multiple select.',
              },
              {
                key: 'showResultsImmediately' as const,
                label: 'Show marks as soon as a paper is submitted',
                hint: 'Leave off to look the papers over first, then release results together.',
              },
            ].map((toggle) => (
              <label
                key={toggle.key}
                className="flex cursor-pointer items-start gap-2.5 text-[13px] font-medium text-ink-2"
              >
                <input
                  type="checkbox"
                  checked={draft[toggle.key]}
                  onChange={(event) => {
                    set(toggle.key, event.target.checked);
                  }}
                  className="mt-0.5 size-3.5 accent-brand"
                />
                <span>
                  {toggle.label}
                  <span className="block text-[12px] font-normal text-ink-3">{toggle.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </DialogBody>

        <DialogFooter>
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
            {isEdit ? 'Save settings' : 'Create and add questions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
