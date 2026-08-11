import { AdminCourseworkPage } from '@/features/admin';
import { useAuth } from '@/features/auth';
import { ParentQuizzesPage } from '@/features/parent';

import StudentQuizzesPage from './student-quizzes-page';
import TeacherQuizzesPage from './teacher-quizzes-page';

/**
 * `/…/quizzes` is a shared route, so this dispatches on role rather than
 * repeating the path per portal.
 *
 * A guardian and an administrator get results and oversight, never the paper.
 * A quiz a class has not all sat is live assessment material, and neither of
 * them has any reason to hold the questions.
 */
export default function QuizzesPage() {
  const { isStudent, isTeacher, isParent } = useAuth();

  if (isStudent) return <StudentQuizzesPage />;
  if (isTeacher) return <TeacherQuizzesPage />;
  if (isParent) return <ParentQuizzesPage />;

  return <AdminCourseworkPage kind="quizzes" />;
}
