import { FileSpreadsheet } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

export default function TeacherGradingPage() {
  return (
    <ModulePlaceholder
      icon={FileSpreadsheet}
      title="Grading"
      description="Mark submissions and publish results."
      planned={[
        'Queue of everything awaiting a mark, oldest first',
        'Side-by-side submission viewer with the rubric',
        'Inline score and feedback entry, keyboard-driven',
        'Manual marking for essay questions in quizzes',
        'Bulk publish to the gradebook',
      ]}
      dataLayer={[
        'assignment_submissions',
        'quiz_attempts',
        'grades',
        'app.sync_grade_from_submission()',
      ]}
    />
  );
}
