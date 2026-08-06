import { FileSpreadsheet } from 'lucide-react';

import { useAuth } from '@/features/auth';
import { ModulePlaceholder } from '@/shared/components/module-placeholder';

import StudentGradesPage from './student-grades-page';
import TeacherGradebookPage from './teacher-gradebook-page';

/** Shared `/…/grades` route. Student and teacher views are live. */
export default function GradesPage() {
  const { isStudent, isTeacher } = useAuth();

  if (isStudent) return <StudentGradesPage />;
  if (isTeacher) return <TeacherGradebookPage />;

  return (
    <ModulePlaceholder
      icon={FileSpreadsheet}
      title="Gradebook"
      description="Continuous assessment, tests and exams, banded against the school's scale."
      planned={[
        'Parent: results across all their children',
        'Administrator: year-group and subject analysis',
        'Printable end-of-term report cards',
      ]}
      dataLayer={['grades', 'app.apply_grade_band()', 'schools.grading_scale']}
    />
  );
}
