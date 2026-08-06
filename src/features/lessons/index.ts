export {
  attachToLesson,
  createLesson,
  deleteLesson,
  getLesson,
  lessonAttachmentUrl,
  listLessonAttachments,
  listLessons,
  publishLesson,
  removeLessonAttachment,
  unpublishLesson,
  updateLesson,
  type LessonAttachment,
  type LessonFilters,
  type LessonWithAuthor,
} from './api/lessons.service';

export {
  useLesson,
  useLessonAttachmentMutations,
  useLessonAttachments,
  useLessonMutations,
  useLessons,
} from './hooks/use-lessons';

export { LessonEditorDialog } from './components/lesson-editor-dialog';

export { default as TeacherLessonsPage } from './pages/teacher-lessons-page';
export { default as TeacherLessonPage } from './pages/teacher-lesson-page';
