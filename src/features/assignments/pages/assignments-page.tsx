import { ClipboardList } from 'lucide-react';

import { useAuth } from '@/features/auth';
import { ModulePlaceholder } from '@/shared/components/module-placeholder';

import StudentAssignmentsPage from './student-assignments-page';
import TeacherAssignmentsPage from './teacher-assignments-page';

/**
 * `/…/assignments` is a shared route across all four portals, so this dispatches
 * on role rather than duplicating the path four times in the router.
 *
 * Student and teacher views are implemented. Parent keeps its placeholder
 * until that phase, which is honest about what exists rather than showing a
 * guardian a teacher's marking board.
 */
export default function AssignmentsPage() {
  const { isStudent, isTeacher } = useAuth();

  if (isStudent) return <StudentAssignmentsPage />;
  if (isTeacher) return <TeacherAssignmentsPage />;

  return (
    <ModulePlaceholder
      icon={ClipboardList}
      title="Assignments"
      description="Set work, collect submissions and return marks."
      planned={['Parent: read-only view of a child’s work and results']}
      dataLayer={[
        'assignments',
        'assignment_submissions',
        'app.enforce_submission_rules()',
        'app.sync_grade_from_submission()',
      ]}
    />
  );
}
