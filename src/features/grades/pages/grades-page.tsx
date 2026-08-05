import { FileSpreadsheet } from 'lucide-react';

import { useAuth } from '@/features/auth';
import { ModulePlaceholder } from '@/shared/components/module-placeholder';

import StudentGradesPage from './student-grades-page';

/** Shared `/…/grades` route. Student view is live; other roles land in their phase. */
export default function GradesPage() {
  const { isStudent } = useAuth();

  if (isStudent) return <StudentGradesPage />;

  return (
    <ModulePlaceholder
      icon={FileSpreadsheet}
      title="Gradebook"
      description="Continuous assessment, tests and exams, banded against the school's scale."
      planned={[
        'Teacher: mark entry with class distribution',
        'Teacher: publish or withhold results per assessment',
        'Parent: results across all their children',
        'Administrator: year-group and subject analysis',
        'Printable end-of-term report cards',
      ]}
      dataLayer={['grades', 'app.apply_grade_band()', 'schools.grading_scale']}
    />
  );
}
