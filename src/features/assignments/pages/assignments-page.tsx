import { AdminCourseworkPage } from '@/features/admin';
import { useAuth } from '@/features/auth';
import { ParentAssignmentsPage } from '@/features/parent';

import StudentAssignmentsPage from './student-assignments-page';
import TeacherAssignmentsPage from './teacher-assignments-page';

/**
 * `/…/assignments` is a shared route across all four portals, so this dispatches
 * on role rather than duplicating the path four times in the router.
 *
 * Four different questions about the same table: a pupil asks what they owe, a
 * teacher what they must mark, a guardian what their child has not handed in,
 * and the office which classes have had nothing set.
 */
export default function AssignmentsPage() {
  const { isStudent, isTeacher, isParent } = useAuth();

  if (isStudent) return <StudentAssignmentsPage />;
  if (isTeacher) return <TeacherAssignmentsPage />;
  if (isParent) return <ParentAssignmentsPage />;

  return <AdminCourseworkPage kind="assignments" />;
}
