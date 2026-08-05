import { BookOpen } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

export default function StudentSubjectsPage() {
  return (
    <ModulePlaceholder
      icon={BookOpen}
      title="My subjects"
      description="Every subject you take this term, with its lessons and materials."
      planned={[
        'Subject tiles with the teacher and next lesson',
        'Course detail: overview, lessons, assignments, resources, grades',
        'Lesson viewer for notes, PDFs and video',
        'Downloadable materials from the lesson-materials bucket',
      ]}
      dataLayer={['class_subjects', 'subjects', 'lessons', 'teacher_assignments']}
    />
  );
}
