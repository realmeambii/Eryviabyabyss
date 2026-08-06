import { ClipboardCheck } from 'lucide-react';

import { useAuth } from '@/features/auth';
import { ModulePlaceholder } from '@/shared/components/module-placeholder';

import StudentQuizzesPage from './student-quizzes-page';
import TeacherQuizzesPage from './teacher-quizzes-page';

/**
 * `/…/quizzes` is a shared route, so this dispatches on role rather than
 * repeating the path per portal.
 *
 * Student and teacher views are live. Parent and administrator keep the
 * placeholder — showing either the authoring screen would hand them the key.
 */
export default function QuizzesPage() {
  const { isStudent, isTeacher } = useAuth();

  if (isStudent) return <StudentQuizzesPage />;
  if (isTeacher) return <TeacherQuizzesPage />;

  return (
    <ModulePlaceholder
      icon={ClipboardCheck}
      title="Tests & quizzes"
      description="Timed objective tests, marked the moment they are handed in."
      planned={[
        'Quiz list with open, upcoming and completed states',
        'Pre-flight screen: duration, attempts, instructions',
        'Timed paper with per-question navigation and autosave',
        'Instant marking for objective questions; teacher marking for essays',
        'Results view with the answer key, once the attempt is graded',
      ]}
      dataLayer={[
        'quizzes',
        'quiz_questions',
        'quiz_attempts',
        'get_quiz_paper()',
        'start_quiz_attempt()',
        'submit_quiz_attempt()',
      ]}
    />
  );
}
