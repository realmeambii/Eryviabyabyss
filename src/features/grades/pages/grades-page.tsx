import { FileSpreadsheet } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

export default function GradesPage() {
  return (
    <ModulePlaceholder
      icon={FileSpreadsheet}
      title="Gradebook"
      description="Continuous assessment, tests and exams, banded against the school's scale."
      planned={[
        'Per-subject breakdown: homework, tests, exam, weighted total',
        'Term average with the WAEC-style letter grade',
        'Teacher mark entry with class distribution',
        'Printable end-of-term report cards',
        'Parent view across all their children',
      ]}
      dataLayer={['grades', 'app.apply_grade_band()', 'schools.grading_scale']}
    />
  );
}
