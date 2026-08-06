import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { queryKeys } from '@/shared/lib/query-keys';

import * as api from '../api/lessons.service';

/**
 * Lesson authoring hooks.
 *
 * Every mutation invalidates the whole `lessons` key rather than patching the
 * cache. A lesson list is a few dozen rows, and the row that comes back from a
 * write has been through `lessons_published_has_timestamp` and the updated_at
 * trigger — refetching is how the screen ends up showing what the database
 * actually stored rather than what the client hoped it would.
 */

function useInvalidateLessons() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.all });
  };
}

export function useLessons(filters: api.LessonFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.lessons.list(filters as Record<string, unknown>),
    queryFn: () => api.listLessons(filters),
    enabled,
    staleTime: 60_000,
  });
}

export function useLesson(lessonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lessons.detail(lessonId ?? 'none'),
    queryFn: () => api.getLesson(lessonId!),
    enabled: Boolean(lessonId),
    staleTime: 60_000,
  });
}

export function useLessonAttachments(lessonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.files.forEntity('lesson', lessonId ?? 'none'),
    queryFn: () => api.listLessonAttachments(lessonId!),
    enabled: Boolean(lessonId),
    staleTime: 60_000,
  });
}

export function useLessonMutations() {
  const invalidate = useInvalidateLessons();
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: api.createLesson,
    onSuccess: (lesson) => {
      toast.success(`“${lesson.title}” saved as a draft.`);
      invalidate();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateLesson>[1] }) =>
      api.updateLesson(id, patch),
    onSuccess: (lesson) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.detail(lesson.id) });
      invalidate();
    },
  });

  const publish = useMutation({
    mutationFn: api.publishLesson,
    onSuccess: (lesson) => {
      toast.success(
        lesson.available_from && new Date(lesson.available_from) > new Date()
          ? `“${lesson.title}” is scheduled. Pupils see it when it opens.`
          : `“${lesson.title}” is live for the class.`,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.detail(lesson.id) });
      invalidate();
    },
  });

  const unpublish = useMutation({
    mutationFn: api.unpublishLesson,
    onSuccess: (lesson) => {
      toast.success(`“${lesson.title}” is back to a draft and hidden from pupils.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.lessons.detail(lesson.id) });
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteLesson,
    onSuccess: () => {
      toast.success('Lesson deleted.');
      invalidate();
    },
  });

  return { create, update, publish, unpublish, remove };
}

export function useLessonAttachmentMutations(lessonId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.files.forEntity('lesson', lessonId ?? 'none'),
    });
  };

  const attach = useMutation({
    mutationFn: api.attachToLesson,
    onSuccess: () => {
      toast.success('Attachment uploaded.');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: api.removeLessonAttachment,
    onSuccess: () => {
      toast.success('Attachment removed.');
      invalidate();
    },
  });

  return { attach, remove };
}
