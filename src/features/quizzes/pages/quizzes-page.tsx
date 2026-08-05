import { ClipboardCheck } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

export default function QuizzesPage() {
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
