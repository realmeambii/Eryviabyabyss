import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

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
import type { Lesson } from '@/shared/types';

import { useLessonMutations } from '../hooks/use-lessons';

/**
 * Create or edit a lesson.
 *
 * Not react-hook-form, unlike the admin dialogs: the rich text editor is not an
 * `<input>` and does not participate in a form's value graph, and the class and
 * subject pickers are interdependent — choosing a class narrows the subjects to
 * the ones this teacher takes with it. Plain state expresses that more honestly
 * than a resolver plus three `watch()` calls.
 *
 * Validation is what the database will accept: a title between 3 and 250
 * characters, and a class–subject pairing that exists in the teacher's scope.
 * Everything else is nullable, because a half-written draft is the normal state
 * of a lesson and the editor must not refuse to save one.
 */

const CONTENT_TYPES = [
  { value: 'note', label: 'Note' },
  { value: 'document', label: 'Document' },
  { value: 'video', label: 'Video' },
  { value: 'slide', label: 'Slides' },
  { value: 'link', label: 'External link' },
  { value: 'embed', label: 'Embed' },
];

interface Draft {
  title: string;
  classId: string;
  subjectId: string;
  summary: string;
  content: string;
  contentType: string;
  weekNumber: string;
  durationMinutes: string;
  externalUrl: string;
  availableFrom: string;
  objectives: string[];
}

const EMPTY: Draft = {
  title: '',
  classId: '',
  subjectId: '',
  summary: '',
  content: '',
  contentType: 'note',
  weekNumber: '',
  durationMinutes: '',
  externalUrl: '',
  availableFrom: '',
  objectives: [],
};

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** `datetime-local` gives "2026-08-06T09:00" with no zone; the column is timestamptz. */
function toTimestamp(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toLocalInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  // Shift into local time before slicing, or the field shows UTC and the
  // teacher schedules an hour off.
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function LessonEditorDialog({
  open,
  onOpenChange,
  lesson,
  defaultClassId,
  defaultSubjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null to create. */
  lesson: Lesson | null;
  defaultClassId?: string;
  defaultSubjectId?: string;
}) {
  const { school, currentSession, teacherId } = useCurrentUser();
  const scope = useTeacherScope();
  const { create, update } = useLessonMutations();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [objectiveInput, setObjectiveInput] = useState('');
  const [touched, setTouched] = useState(false);

  const isEdit = lesson !== null;

  useEffect(() => {
    if (!open) return;

    setTouched(false);
    setObjectiveInput('');
    create.reset();
    update.reset();

    setDraft(
      lesson
        ? {
            title: lesson.title,
            classId: lesson.class_id,
            subjectId: lesson.subject_id,
            summary: lesson.summary ?? '',
            content: lesson.content ?? '',
            contentType: lesson.content_type,
            weekNumber: lesson.week_number?.toString() ?? '',
            durationMinutes: lesson.duration_minutes?.toString() ?? '',
            externalUrl: lesson.external_url ?? '',
            availableFrom: toLocalInput(lesson.available_from),
            objectives: lesson.objectives ?? [],
          }
        : { ...EMPTY, classId: defaultClassId ?? '', subjectId: defaultSubjectId ?? '' },
    );
    // Reopening must reset; the mutation objects are not stable identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lesson?.id]);

  /** Subjects this teacher takes with the chosen class — not every subject. */
  const subjectOptions = useMemo(() => {
    if (!draft.classId) return [];
    return scope.classes.find((row) => row.id === draft.classId)?.subjects ?? [];
  }, [scope.classes, draft.classId]);

  // A class change can strand a subject the teacher does not take with it.
  useEffect(() => {
    if (!draft.subjectId) return;
    if (subjectOptions.some((subject) => subject.id === draft.subjectId)) return;
    setDraft((current) => ({ ...current, subjectId: '' }));
  }, [subjectOptions, draft.subjectId]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const titleError =
    touched && draft.title.trim().length < 3
      ? 'Give the lesson a title of at least 3 characters.'
      : null;
  const classError = touched && !draft.classId ? 'Choose a class.' : null;
  const subjectError = touched && !draft.subjectId ? 'Choose a subject.' : null;
  const isValid = draft.title.trim().length >= 3 && Boolean(draft.classId && draft.subjectId);

  const isPending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;

  const addObjective = () => {
    const value = objectiveInput.trim();
    if (!value) return;
    set('objectives', [...draft.objectives, value]);
    setObjectiveInput('');
  };

  const submit = () => {
    setTouched(true);
    if (!isValid || !school || !currentSession) return;

    const shared = {
      title: draft.title.trim(),
      summary: orNull(draft.summary),
      content: orNull(draft.content),
      content_type: draft.contentType as Lesson['content_type'],
      week_number: draft.weekNumber ? Number(draft.weekNumber) : null,
      duration_minutes: draft.durationMinutes ? Number(draft.durationMinutes) : null,
      external_url: orNull(draft.externalUrl),
      available_from: toTimestamp(draft.availableFrom),
      objectives: draft.objectives.length > 0 ? draft.objectives : null,
    };

    const done = {
      onSuccess: () => {
        onOpenChange(false);
      },
    };

    if (isEdit) {
      update.mutate(
        {
          id: lesson.id,
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
        // Always a draft. Publishing is a separate, deliberate act — see the
        // lesson list — so a teacher cannot make a half-written lesson live by
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
          <DialogTitle>{isEdit ? 'Edit lesson' : 'New lesson'}</DialogTitle>
          <DialogDescription>
            Saved as a draft. Pupils see nothing until you publish it.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {failure ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(failure)}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="lesson-title">Title</Label>
            <Input
              id="lesson-title"
              value={draft.title}
              onChange={(event) => {
                set('title', event.target.value);
              }}
              placeholder="Photosynthesis — the light-dependent stage"
              aria-invalid={titleError !== null}
              autoFocus
            />
            {titleError ? <p className="text-[12.5px] text-danger">{titleError}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-class">Class</Label>
              <Select
                id="lesson-class"
                value={draft.classId}
                onChange={(event) => {
                  set('classId', event.target.value);
                }}
                placeholder="Choose a class"
                aria-invalid={classError !== null}
                options={scope.classes.map((row) => ({
                  value: row.id,
                  label: formatClassName(row.name, row.arm),
                }))}
              />
              {classError ? <p className="text-[12.5px] text-danger">{classError}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lesson-subject">Subject</Label>
              <Select
                id="lesson-subject"
                value={draft.subjectId}
                onChange={(event) => {
                  set('subjectId', event.target.value);
                }}
                disabled={!draft.classId}
                placeholder={draft.classId ? 'Choose a subject' : 'Choose a class first'}
                aria-invalid={subjectError !== null}
                options={subjectOptions.map((subject) => ({
                  value: subject.id,
                  label: subject.name,
                }))}
              />
              {subjectError ? <p className="text-[12.5px] text-danger">{subjectError}</p> : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lesson-summary">Summary</Label>
            <Textarea
              id="lesson-summary"
              value={draft.summary}
              onChange={(event) => {
                set('summary', event.target.value);
              }}
              rows={2}
              placeholder="One or two lines, shown in the lesson list."
            />
          </div>

          {/* ── Objectives ───────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>Learning objectives</Label>
            {draft.objectives.length > 0 ? (
              <ol className="space-y-1.5">
                {draft.objectives.map((objective, index) => (
                  <li
                    key={`${objective}-${index}`}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5"
                  >
                    <span className="font-mono text-[11.5px] text-ink-3">{index + 1}</span>
                    <span className="min-w-0 flex-1 text-[13.5px] text-ink-2">{objective}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove objective ${index + 1}`}
                      onClick={() => {
                        set(
                          'objectives',
                          draft.objectives.filter((_, position) => position !== index),
                        );
                      }}
                    >
                      <X className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ol>
            ) : null}

            <div className="flex gap-2">
              <Input
                value={objectiveInput}
                onChange={(event) => {
                  setObjectiveInput(event.target.value);
                }}
                onKeyDown={(event) => {
                  // Enter adds the objective rather than submitting the dialog.
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  addObjective();
                }}
                placeholder="By the end, pupils can…"
                aria-label="New learning objective"
              />
              <Button type="button" variant="secondary" onClick={addObjective}>
                <Plus className="size-4" aria-hidden />
                Add
              </Button>
            </div>
          </div>

          {/* ── Body ─────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>Lesson content</Label>
            <RichTextEditor
              value={draft.content}
              onChange={(html) => {
                set('content', html);
              }}
              placeholder="Write the lesson — notes, worked examples, questions to work through…"
              aria-label="Lesson content"
              minHeight={260}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-type">Kind</Label>
              <Select
                id="lesson-type"
                value={draft.contentType}
                onChange={(event) => {
                  set('contentType', event.target.value);
                }}
                options={CONTENT_TYPES}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lesson-week">Week</Label>
              <Input
                id="lesson-week"
                type="number"
                min={1}
                max={20}
                value={draft.weekNumber}
                onChange={(event) => {
                  set('weekNumber', event.target.value);
                }}
                placeholder="1–20"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lesson-duration">Minutes</Label>
              <Input
                id="lesson-duration"
                type="number"
                min={1}
                max={600}
                value={draft.durationMinutes}
                onChange={(event) => {
                  set('durationMinutes', event.target.value);
                }}
                placeholder="40"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lesson-url">External link</Label>
            <Input
              id="lesson-url"
              type="url"
              value={draft.externalUrl}
              onChange={(event) => {
                set('externalUrl', event.target.value);
              }}
              placeholder="https://… a video or reading to go with the lesson"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lesson-available">Open to pupils from</Label>
            <Input
              id="lesson-available"
              type="datetime-local"
              value={draft.availableFrom}
              onChange={(event) => {
                set('availableFrom', event.target.value);
              }}
            />
            <p className="text-[12px] text-ink-3">
              Leave blank to open as soon as it is published. Set a date to prepare ahead — the
              lesson stays hidden until then even once published.
            </p>
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
