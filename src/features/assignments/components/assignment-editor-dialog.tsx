import { useEffect, useMemo, useState } from 'react';

import { useCurrentUser } from '@/features/auth';
import { useTeacherScope } from '@/features/teacher';
import { RichTextEditor } from '@/shared/components/rich-text-editor';
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
import type { Assignment, Json, RubricCriterion } from '@/shared/types';

import { useAssignmentMutations } from '../hooks/use-assignments';
import { RubricBuilder } from './rubric-builder';

/**
 * Create or edit an assignment.
 *
 * Two rules the database enforces and this form mirrors, so a teacher hears
 * about them here rather than as a constraint violation:
 *   • `assignments_close_after_due` — the hard cut-off cannot precede the
 *     deadline.
 *   • `weight` is a fraction of the term grade between 0 and 1; it is entered
 *     as a percentage because nobody thinks in 0.15.
 */

const ASSESSMENT_TYPES = [
  { value: 'homework', label: 'Homework' },
  { value: 'classwork', label: 'Classwork' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'project', label: 'Project' },
  { value: 'test', label: 'Test' },
  { value: 'exam', label: 'Exam' },
];

interface Draft {
  title: string;
  classId: string;
  subjectId: string;
  assessmentType: string;
  description: string;
  instructions: string;
  maxScore: string;
  weightPercent: string;
  dueAt: string;
  closesAt: string;
  allowLate: boolean;
  latePenalty: string;
  allowResubmission: boolean;
  maxAttempts: string;
  rubric: RubricCriterion[];
}

function defaultDue(): string {
  // A week out, at 4pm — the shape of a homework deadline, and better than an
  // empty required field.
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(16, 0, 0, 0);
  return toLocalInput(date.toISOString());
}

const EMPTY = (): Draft => ({
  title: '',
  classId: '',
  subjectId: '',
  assessmentType: 'homework',
  description: '',
  instructions: '',
  maxScore: '100',
  weightPercent: '10',
  dueAt: defaultDue(),
  closesAt: '',
  allowLate: true,
  latePenalty: '0',
  allowResubmission: false,
  maxAttempts: '1',
  rubric: [],
});

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

/** The rubric arrives as `Json`; anything that is not our array shape is dropped. */
function readRubric(value: Json | null): RubricCriterion[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
    const row = entry as Record<string, Json | undefined>;
    if (typeof row.criterion !== 'string') return [];

    return [
      {
        id: typeof row.id === 'string' ? row.id : crypto.randomUUID(),
        criterion: row.criterion,
        points: typeof row.points === 'number' ? row.points : 0,
        descriptor: typeof row.descriptor === 'string' ? row.descriptor : '',
      },
    ];
  });
}

export function AssignmentEditorDialog({
  open,
  onOpenChange,
  assignment,
  defaultClassId,
  defaultSubjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null to create. */
  assignment: Assignment | null;
  defaultClassId?: string;
  defaultSubjectId?: string;
}) {
  const { school, currentSession, teacherId } = useCurrentUser();
  const scope = useTeacherScope();
  const { create, update } = useAssignmentMutations();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [touched, setTouched] = useState(false);

  const isEdit = assignment !== null;

  useEffect(() => {
    if (!open) return;

    setTouched(false);
    create.reset();
    update.reset();

    setDraft(
      assignment
        ? {
            title: assignment.title,
            classId: assignment.class_id,
            subjectId: assignment.subject_id,
            assessmentType: assignment.assessment_type,
            description: assignment.description ?? '',
            instructions: assignment.instructions ?? '',
            maxScore: assignment.max_score.toString(),
            weightPercent: Math.round(assignment.weight * 100).toString(),
            dueAt: toLocalInput(assignment.due_at),
            closesAt: toLocalInput(assignment.closes_at),
            allowLate: assignment.allow_late,
            latePenalty: assignment.late_penalty_percent.toString(),
            allowResubmission: assignment.allow_resubmission,
            maxAttempts: assignment.max_attempts.toString(),
            rubric: readRubric(assignment.rubric),
          }
        : { ...EMPTY(), classId: defaultClassId ?? '', subjectId: defaultSubjectId ?? '' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment?.id]);

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

  const maxScore = Number(draft.maxScore);
  const closesBeforeDue =
    draft.closesAt !== '' && draft.dueAt !== '' && new Date(draft.closesAt) < new Date(draft.dueAt);

  const errors = {
    title: touched && draft.title.trim().length < 3 ? 'At least 3 characters.' : null,
    classId: touched && !draft.classId ? 'Choose a class.' : null,
    subjectId: touched && !draft.subjectId ? 'Choose a subject.' : null,
    dueAt: touched && !draft.dueAt ? 'A deadline is required.' : null,
    maxScore:
      touched && (!Number.isFinite(maxScore) || maxScore <= 0)
        ? 'The total must be greater than zero.'
        : null,
    closesAt: closesBeforeDue ? 'The cut-off cannot be before the deadline.' : null,
  };

  const isValid =
    draft.title.trim().length >= 3 &&
    Boolean(draft.classId && draft.subjectId && draft.dueAt) &&
    Number.isFinite(maxScore) &&
    maxScore > 0 &&
    !closesBeforeDue;

  const isPending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;

  const submit = () => {
    setTouched(true);
    if (!isValid || !school || !currentSession) return;

    const shared = {
      title: draft.title.trim(),
      description: orNull(draft.description),
      instructions: orNull(draft.instructions),
      assessment_type: draft.assessmentType as Assignment['assessment_type'],
      max_score: maxScore,
      // Stored as a 0–1 fraction; entered as a percentage.
      weight: Math.min(1, Math.max(0, Number(draft.weightPercent) / 100)),
      due_at: toTimestamp(draft.dueAt)!,
      closes_at: toTimestamp(draft.closesAt),
      allow_late: draft.allowLate,
      late_penalty_percent: draft.allowLate ? Number(draft.latePenalty || 0) : 0,
      allow_resubmission: draft.allowResubmission,
      max_attempts: draft.allowResubmission ? Number(draft.maxAttempts || 1) : 1,
      rubric: draft.rubric.length > 0 ? (draft.rubric as unknown as Json) : null,
    };

    const done = {
      onSuccess: () => {
        onOpenChange(false);
      },
    };

    if (isEdit) {
      update.mutate(
        {
          id: assignment.id,
          patch: { ...shared, class_id: draft.classId, subject_id: draft.subjectId },
        },
        done,
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
        // Publishing notifies the whole class, so it is never a side effect of
        // pressing Save.
        status: 'draft',
      },
      done,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit assignment' : 'New assignment'}</DialogTitle>
          <DialogDescription>
            Saved as a draft. The class is notified the moment you publish it.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {failure ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(failure)}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="a-title">Title</Label>
            <Input
              id="a-title"
              value={draft.title}
              onChange={(event) => {
                set('title', event.target.value);
              }}
              placeholder="Quadratic equations — problem set 3"
              aria-invalid={errors.title !== null}
              autoFocus
            />
            {errors.title ? <p className="text-[12.5px] text-danger">{errors.title}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="a-class">Class</Label>
              <Select
                id="a-class"
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
              <Label htmlFor="a-subject">Subject</Label>
              <Select
                id="a-subject"
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
              <Label htmlFor="a-type">Kind</Label>
              <Select
                id="a-type"
                value={draft.assessmentType}
                onChange={(event) => {
                  set('assessmentType', event.target.value);
                }}
                options={ASSESSMENT_TYPES}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-description">Description</Label>
            <Textarea
              id="a-description"
              value={draft.description}
              onChange={(event) => {
                set('description', event.target.value);
              }}
              rows={2}
              placeholder="One line, shown in the assignment list."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Instructions</Label>
            <RichTextEditor
              value={draft.instructions}
              onChange={(html) => {
                set('instructions', html);
              }}
              placeholder="What to do, how to set it out, what to hand in…"
              aria-label="Assignment instructions"
              minHeight={180}
            />
          </div>

          {/* ── Marks ────────────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-max">Total marks</Label>
              <Input
                id="a-max"
                type="number"
                min={1}
                step="0.5"
                value={draft.maxScore}
                onChange={(event) => {
                  set('maxScore', event.target.value);
                }}
                aria-invalid={errors.maxScore !== null}
              />
              {errors.maxScore ? (
                <p className="text-[12.5px] text-danger">{errors.maxScore}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="a-weight">Weight of the term grade (%)</Label>
              <Input
                id="a-weight"
                type="number"
                min={0}
                max={100}
                value={draft.weightPercent}
                onChange={(event) => {
                  set('weightPercent', event.target.value);
                }}
              />
            </div>
          </div>

          <RubricBuilder
            value={draft.rubric}
            onChange={(next) => {
              set('rubric', next);
            }}
            maxScore={Number.isFinite(maxScore) ? maxScore : 0}
          />

          {/* ── Timing ───────────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-due">Due</Label>
              <Input
                id="a-due"
                type="datetime-local"
                value={draft.dueAt}
                onChange={(event) => {
                  set('dueAt', event.target.value);
                }}
                aria-invalid={errors.dueAt !== null}
              />
              {errors.dueAt ? <p className="text-[12.5px] text-danger">{errors.dueAt}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="a-closes">Hard cut-off</Label>
              <Input
                id="a-closes"
                type="datetime-local"
                value={draft.closesAt}
                onChange={(event) => {
                  set('closesAt', event.target.value);
                }}
                aria-invalid={errors.closesAt !== null}
              />
              {errors.closesAt ? (
                <p className="text-[12.5px] text-danger">{errors.closesAt}</p>
              ) : (
                <p className="text-[12px] text-ink-3">
                  After this nothing is accepted at all. Leave blank for no cut-off.
                </p>
              )}
            </div>
          </div>

          {/* ── Late and resubmission ────────────────────────────────────── */}
          <div className="space-y-3 border-t border-border pt-4">
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-ink-2">
              <input
                type="checkbox"
                checked={draft.allowLate}
                onChange={(event) => {
                  set('allowLate', event.target.checked);
                }}
                className="size-3.5 accent-brand"
              />
              Accept late submissions
            </label>

            {draft.allowLate ? (
              <div className="space-y-1.5 pl-6">
                <Label htmlFor="a-penalty">Late penalty (%)</Label>
                <Input
                  id="a-penalty"
                  type="number"
                  min={0}
                  max={100}
                  value={draft.latePenalty}
                  onChange={(event) => {
                    set('latePenalty', event.target.value);
                  }}
                  className="max-w-[10rem]"
                />
              </div>
            ) : null}

            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-ink-2">
              <input
                type="checkbox"
                checked={draft.allowResubmission}
                onChange={(event) => {
                  set('allowResubmission', event.target.checked);
                }}
                className="size-3.5 accent-brand"
              />
              Allow resubmission
            </label>

            {draft.allowResubmission ? (
              <div className="space-y-1.5 pl-6">
                <Label htmlFor="a-attempts">Attempts allowed</Label>
                <Input
                  id="a-attempts"
                  type="number"
                  min={1}
                  max={10}
                  value={draft.maxAttempts}
                  onChange={(event) => {
                    set('maxAttempts', event.target.value);
                  }}
                  className="max-w-[10rem]"
                />
              </div>
            ) : null}
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
            {isEdit ? 'Save changes' : 'Save draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
