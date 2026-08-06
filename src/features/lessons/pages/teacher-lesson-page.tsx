import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Clock,
  Download,
  Eye,
  EyeOff,
  Library,
  Paperclip,
  Pencil,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { useTeacherScope } from '@/features/teacher';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { RichText } from '@/shared/components/rich-text';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { UPLOAD_LIMITS } from '@/shared/lib/constants';
import { errorMessage } from '@/shared/lib/errors';
import { lessonAttachmentUrl } from '../api/lessons.service';
import {
  className as formatClassName,
  formatDateTime,
  formatFileSize,
  formatRelative,
} from '@/shared/utils/format';

import { LessonEditorDialog } from '../components/lesson-editor-dialog';
import {
  useLesson,
  useLessonAttachmentMutations,
  useLessonAttachments,
  useLessonMutations,
} from '../hooks/use-lessons';
import type { LessonAttachment } from '../api/lessons.service';
import { LessonStatus } from './teacher-lessons-page';

/**
 * A single lesson, as its author sees it.
 *
 * The body is rendered through `<RichText>`, which sanitises. That matters even
 * here — the teacher viewing it is usually the author, but a co-teacher on the
 * same class–subject can open it too, and content is content whoever wrote it.
 */
export default function TeacherLessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const { school, user } = useCurrentUser();
  const scope = useTeacherScope();

  const lesson = useLesson(lessonId);
  const attachments = useLessonAttachments(lessonId);
  const { publish, unpublish, remove } = useLessonMutations();
  const { attach, remove: removeAttachment } = useLessonAttachmentMutations(lessonId);

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detaching, setDetaching] = useState<LessonAttachment | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (lesson.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-96" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (lesson.error || !lesson.data) {
    return (
      <EmptyState
        icon={Library}
        title="Lesson not found"
        description={
          lesson.error
            ? errorMessage(lesson.error)
            : 'It may have been deleted, or it belongs to a class you do not teach.'
        }
        action={
          <Button asChild>
            <Link to="/teacher/lessons">Back to lessons</Link>
          </Button>
        }
      />
    );
  }

  const row = lesson.data;
  const classRow = scope.classes.find((entry) => entry.id === row.class_id);
  const subject = scope.subjects.find((entry) => entry.id === row.subject_id);
  const isPublished = row.status === 'published';

  const onPickFile = (file: File | undefined) => {
    if (!file || !lessonId || !school) return;
    attach.mutate({
      lessonId,
      classId: row.class_id,
      schoolId: school.id,
      ownerId: user.id,
      file,
    });
  };

  const download = async (file: LessonAttachment) => {
    // The signed URL is a bearer credential with a short life, so it is
    // fetched at the moment of the click and never cached.
    const url = await lessonAttachmentUrl(file);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Lessons' },
          { label: classRow ? formatClassName(classRow.name, classRow.arm) : 'Class' },
          { label: row.title },
        ]}
        title={row.title}
        description={
          [
            subject?.name,
            classRow ? formatClassName(classRow.name, classRow.arm) : null,
            row.week_number ? `Week ${row.week_number}` : null,
            row.duration_minutes ? `${row.duration_minutes} min` : null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LessonStatus lesson={row} />
            {isPublished ? (
              <Button
                variant="secondary"
                loading={unpublish.isPending}
                onClick={() => {
                  unpublish.mutate(row.id);
                }}
              >
                <EyeOff className="size-4" aria-hidden />
                Unpublish
              </Button>
            ) : (
              <Button
                loading={publish.isPending}
                onClick={() => {
                  publish.mutate(row.id);
                }}
              >
                <Eye className="size-4" aria-hidden />
                Publish
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(true);
              }}
            >
              <Pencil className="size-4" aria-hidden />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete lesson"
              onClick={() => {
                setDeleting(true);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        }
      />

      {row.available_from && new Date(row.available_from) > new Date() ? (
        <Card className="border-warning/30 bg-warning-soft/30">
          <CardContent className="flex items-center gap-3 py-3">
            <Clock className="size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-[13.5px] text-ink-2">
              Scheduled — pupils see this from <strong>{formatDateTime(row.available_from)}</strong>
              , even though it is published.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {row.summary ? (
            <Card>
              <CardContent className="py-4">
                <p className="text-[14px] text-ink-2 italic">{row.summary}</p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Lesson</CardTitle>
            </CardHeader>
            <CardContent>
              {row.content ? (
                <RichText html={row.content} />
              ) : (
                <p className="py-8 text-center text-[13px] text-ink-3">
                  Nothing written yet. Use Edit to add the lesson body.
                </p>
              )}

              {row.external_url ? (
                <p className="mt-5 border-t border-border pt-4 text-[13px]">
                  <a
                    href={row.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand underline underline-offset-2"
                  >
                    {row.external_url}
                  </a>
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {(row.objectives ?? []).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="size-4 text-ink-3" aria-hidden />
                  Objectives
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {(row.objectives ?? []).map((objective, index) => (
                    <li key={`${objective}-${index}`} className="flex gap-2.5">
                      <span className="font-mono text-[11.5px] text-ink-3">{index + 1}</span>
                      <span className="text-[13.5px] text-ink-2">{objective}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}

          {/* ── Attachments ────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="size-4 text-ink-3" aria-hidden />
                Materials
              </CardTitle>
              <Button
                variant="secondary"
                size="sm"
                loading={attach.isPending}
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="size-3.5" aria-hidden />
                Add
              </Button>
            </CardHeader>

            <CardContent>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                accept={UPLOAD_LIMITS['lesson-materials'].accept}
                onChange={(event) => {
                  onPickFile(event.target.files?.[0]);
                  // Reset so re-picking the same file fires change again.
                  event.target.value = '';
                }}
              />

              {attachments.isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }, (_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              ) : (attachments.data ?? []).length === 0 ? (
                <p className="py-5 text-center text-[13px] text-ink-3">
                  No slides, worksheets or videos attached yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {(attachments.data ?? []).map((file) => (
                    <li
                      key={file.id}
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">
                          {file.original_name}
                        </span>
                        <span className="block text-[11.5px] text-ink-3">
                          {formatFileSize(file.size_bytes)} · {formatRelative(file.created_at)}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Download ${file.original_name}`}
                        onClick={() => {
                          void download(file);
                        }}
                      >
                        <Download className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${file.original_name}`}
                        onClick={() => {
                          setDetaching(file);
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="pt-3 text-[11.5px] text-ink-3">
                PDFs, Word, PowerPoint, images, video and audio up to{' '}
                {formatFileSize(UPLOAD_LIMITS['lesson-materials'].maxBytes)}.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <LessonEditorDialog open={editing} lesson={row} onOpenChange={setEditing} />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${row.title}”?`}
        description="The lesson and its attachments are removed. This cannot be undone — unpublishing hides it from pupils and keeps the work."
        confirmLabel="Delete lesson"
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          remove.mutate(row.id);
        }}
      />

      <ConfirmDialog
        open={detaching !== null}
        onOpenChange={(next) => {
          if (!next) setDetaching(null);
        }}
        title={`Remove ${detaching?.original_name ?? 'this file'}?`}
        description="Pupils will no longer be able to download it."
        confirmLabel="Remove file"
        destructive
        isPending={removeAttachment.isPending}
        onConfirm={() => {
          if (!detaching) return;
          removeAttachment.mutate(detaching, {
            onSuccess: () => {
              setDetaching(null);
            },
          });
        }}
      />
    </div>
  );
}
