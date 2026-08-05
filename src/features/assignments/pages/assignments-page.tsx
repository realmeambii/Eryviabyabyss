import { ClipboardList } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

export default function AssignmentsPage() {
  return (
    <ModulePlaceholder
      icon={ClipboardList}
      title="Assignments"
      description="Set work, collect submissions and return marks."
      planned={[
        'Assignment list with due-date grouping and status filters',
        'Assignment detail with the brief, attachments and submission form',
        'File uploads into the assignment-uploads bucket',
        'Teacher grading queue with inline marks and feedback',
        'Late-submission handling and resubmission windows',
      ]}
      dataLayer={[
        'assignments',
        'assignment_submissions',
        'app.enforce_submission_rules()',
        'app.sync_grade_from_submission()',
      ]}
    />
  );
}
