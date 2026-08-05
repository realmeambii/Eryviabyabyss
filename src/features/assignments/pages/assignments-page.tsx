import { ClipboardList } from 'lucide-react';

import { useAuth } from '@/features/auth';
import { ModulePlaceholder } from '@/shared/components/module-placeholder';

import StudentAssignmentsPage from './student-assignments-page';

/**
 * `/…/assignments` is a shared route across all four portals, so this dispatches
 * on role rather than duplicating the path four times in the router.
 *
 * Only the student view is implemented. Teacher and parent keep their
 * placeholder until their phase, which is honest about what exists rather than
 * showing them a student's list with the wrong data in it.
 */
export default function AssignmentsPage() {
  const { isStudent } = useAuth();

  if (isStudent) return <StudentAssignmentsPage />;

  return (
    <ModulePlaceholder
      icon={ClipboardList}
      title="Assignments"
      description="Set work, collect submissions and return marks."
      planned={[
        'Teacher: create and publish assignments to a class',
        'Teacher: submission tracker with who has and has not handed in',
        'Teacher: inline marking with feedback',
        'Parent: read-only view of a child’s work and results',
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
