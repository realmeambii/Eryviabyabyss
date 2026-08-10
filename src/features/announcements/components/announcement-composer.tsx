import { useEffect, useState } from 'react';

import { useAuth, useCurrentUser } from '@/features/auth';
import { useClasses } from '@/features/admin';
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
import type { Announcement } from '@/shared/types';

import { useAnnouncementMutations } from '../hooks/use-announcements';

/**
 * Write a notice.
 *
 * Who may address whom is decided by `announcements_insert_staff`, and this
 * form mirrors it rather than inventing a second rule:
 *
 *   administrator   the whole school, or one class
 *   teacher         one of *their* classes, and nothing else
 *
 * A teacher therefore gets no audience picker at all — only a class list, and
 * only the classes in their scope. That is not a courtesy: the policy checks
 * `app.teaches_class(class_id)`, so anything else comes back as a permission
 * error. Offering the choice and then refusing it would be worse than not
 * offering it.
 */

const PRIORITIES = [
  { value: 'normal', label: 'Normal' },
  { value: 'important', label: 'Important' },
  { value: 'urgent', label: 'Urgent' },
];

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

export function AnnouncementComposer({
  open,
  onOpenChange,
  announcement,
  defaultClassId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null to write a new one. */
  announcement: Announcement | null;
  defaultClassId?: string;
}) {
  const { isAdministrator } = useAuth();
  const { school, user, currentSession } = useCurrentUser();
  const { create, update } = useAnnouncementMutations();

  /**
   * Which classes are on offer depends on who is asking, and the two sources
   * are genuinely different queries — not one filtered two ways.
   *
   * A teacher picks from `teacher_assignments`, because that is exactly what
   * `app.teaches_class()` will check on insert. An administrator has no teacher
   * scope at all, so the same hook would hand them an empty list and a
   * school-wide notice would be their only working option. They read the
   * school's classes instead.
   *
   * Both hooks run unconditionally — rules of hooks — but each is disabled for
   * the role it does not serve, so only one query is ever in flight.
   */
  const scope = useTeacherScope();
  const schoolClasses = useClasses();

  const classOptions = isAdministrator
    ? (schoolClasses.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        arm: row.arm,
      }))
    : scope.classes.map((row) => ({ id: row.id, name: row.name, arm: row.arm }));

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'school' | 'class'>('class');
  const [classId, setClassId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [isPinned, setIsPinned] = useState(false);
  const [publishAt, setPublishAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [touched, setTouched] = useState(false);

  const isEdit = announcement !== null;

  useEffect(() => {
    if (!open) return;

    setTouched(false);
    create.reset();
    update.reset();

    if (announcement) {
      setTitle(announcement.title);
      setBody(announcement.body);
      setAudience(announcement.audience === 'school' ? 'school' : 'class');
      setClassId(announcement.class_id ?? '');
      setPriority(announcement.priority);
      setIsPinned(announcement.is_pinned);
      setPublishAt(toLocalInput(announcement.publish_at));
      setExpiresAt(toLocalInput(announcement.expires_at));
    } else {
      setTitle('');
      setBody('');
      // A teacher has exactly one option, so it is chosen for them.
      setAudience(isAdministrator ? 'school' : 'class');
      setClassId(defaultClassId ?? '');
      setPriority('normal');
      setIsPinned(false);
      setPublishAt('');
      setExpiresAt('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, announcement?.id]);

  const needsClass = audience === 'class';

  // `announcements_expiry_after_publish` rejects this at the database.
  const expiryInverted =
    expiresAt !== '' && new Date(expiresAt) <= new Date(publishAt === '' ? Date.now() : publishAt);

  const errors = {
    title:
      touched && (title.trim().length < 3 || title.trim().length > 250)
        ? 'Between 3 and 250 characters.'
        : null,
    body: touched && body.trim().length === 0 ? 'Write the notice.' : null,
    classId: touched && needsClass && !classId ? 'Choose a class.' : null,
    expiresAt: expiryInverted ? 'It cannot expire before it is posted.' : null,
  };

  const isValid =
    title.trim().length >= 3 &&
    title.trim().length <= 250 &&
    body.trim().length > 0 &&
    (!needsClass || Boolean(classId)) &&
    !expiryInverted;

  const isPending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;

  const submit = (publish: boolean) => {
    setTouched(true);
    if (!isValid || !school) return;

    const shared = {
      title: title.trim(),
      body: body.trim(),
      audience,
      // The CHECK constraint requires the target column to match the audience,
      // so a school-wide notice must send a null class.
      class_id: needsClass ? classId : null,
      priority: priority as Announcement['priority'],
      is_pinned: isPinned,
      expires_at: toTimestamp(expiresAt),
      status: (publish ? 'published' : 'draft') as Announcement['status'],
      publish_at: toTimestamp(publishAt) ?? new Date().toISOString(),
    };

    const done = {
      onSuccess: () => {
        onOpenChange(false);
      },
    };

    if (isEdit) {
      update.mutate({ id: announcement.id, patch: shared }, done);
      return;
    }

    create.mutate(
      {
        ...shared,
        school_id: school.id,
        author_id: user.id,
        academic_session_id: currentSession?.id ?? null,
      },
      done,
    );
  };

  const scheduled = publishAt !== '' && new Date(publishAt) > new Date();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit notice' : 'New notice'}</DialogTitle>
          <DialogDescription>
            {isAdministrator
              ? 'Post to the whole school or to one class.'
              : 'Notices go to a class you teach. School-wide notices come from the office.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {failure ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(failure)}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="an-title">Title</Label>
            <Input
              id="an-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
              placeholder="Mid-term test moved to Thursday"
              aria-invalid={errors.title !== null}
              autoFocus
            />
            {errors.title ? <p className="text-[12.5px] text-danger">{errors.title}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="an-body">Notice</Label>
            <Textarea
              id="an-body"
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
              }}
              rows={5}
              placeholder="What you want them to know."
              aria-invalid={errors.body !== null}
            />
            {errors.body ? <p className="text-[12.5px] text-danger">{errors.body}</p> : null}
          </div>

          {/* ── Audience ─────────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            {isAdministrator ? (
              <div className="space-y-1.5">
                <Label htmlFor="an-audience">Who sees it</Label>
                <Select
                  id="an-audience"
                  value={audience}
                  onChange={(event) => {
                    setAudience(event.target.value as 'school' | 'class');
                  }}
                  options={[
                    { value: 'school', label: 'The whole school' },
                    { value: 'class', label: 'One class' },
                  ]}
                />
              </div>
            ) : null}

            {needsClass ? (
              <div className={isAdministrator ? 'space-y-1.5' : 'space-y-1.5 sm:col-span-2'}>
                <Label htmlFor="an-class">Class</Label>
                <Select
                  id="an-class"
                  value={classId}
                  onChange={(event) => {
                    setClassId(event.target.value);
                  }}
                  placeholder="Choose a class"
                  aria-invalid={errors.classId !== null}
                  options={classOptions.map((row) => ({
                    value: row.id,
                    label: formatClassName(row.name, row.arm),
                  }))}
                />
                {errors.classId ? (
                  <p className="text-[12.5px] text-danger">{errors.classId}</p>
                ) : classOptions.length === 0 ? (
                  <p className="text-[12px] text-ink-3">
                    {isAdministrator
                      ? 'No classes exist for this term yet.'
                      : 'You have no classes this term, so there is nobody to address.'}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="an-priority">Priority</Label>
              <Select
                id="an-priority"
                value={priority}
                onChange={(event) => {
                  setPriority(event.target.value);
                }}
                options={PRIORITIES}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="an-publish">Post at</Label>
              <Input
                id="an-publish"
                type="datetime-local"
                value={publishAt}
                onChange={(event) => {
                  setPublishAt(event.target.value);
                }}
              />
              <p className="text-[12px] text-ink-3">Leave blank to post now.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="an-expires">Take down at</Label>
            <Input
              id="an-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => {
                setExpiresAt(event.target.value);
              }}
              aria-invalid={errors.expiresAt !== null}
            />
            {errors.expiresAt ? (
              <p className="text-[12.5px] text-danger">{errors.expiresAt}</p>
            ) : (
              <p className="text-[12px] text-ink-3">Optional. It disappears from the board then.</p>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 border-t border-border pt-4 text-[13px] font-medium text-ink-2">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(event) => {
                setIsPinned(event.target.checked);
              }}
              className="size-3.5 accent-brand"
            />
            Pin it to the top of the board
          </label>
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
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => {
              submit(false);
            }}
          >
            Save draft
          </Button>
          <Button
            type="button"
            loading={isPending}
            onClick={() => {
              submit(true);
            }}
          >
            {scheduled ? 'Schedule' : 'Post now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
