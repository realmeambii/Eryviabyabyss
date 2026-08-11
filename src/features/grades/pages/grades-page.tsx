import { useAuth } from '@/features/auth';

import AdminResultsPage from './admin-results-page';
import ParentResultsPage from './parent-results-page';
import StudentGradesPage from './student-grades-page';
import TeacherGradebookPage from './teacher-gradebook-page';

/**
 * Shared `/…/grades` route.
 *
 * Four views of one table. A pupil reads their own marks, a guardian reads
 * their children's, a teacher edits one class at a time, and the office reads
 * the school whole and decides what is published.
 */
export default function GradesPage() {
  const { isStudent, isTeacher, isParent } = useAuth();

  if (isStudent) return <StudentGradesPage />;
  if (isTeacher) return <TeacherGradebookPage />;
  if (isParent) return <ParentResultsPage />;

  return <AdminResultsPage />;
}
