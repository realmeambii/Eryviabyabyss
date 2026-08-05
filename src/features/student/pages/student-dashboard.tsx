import { BookOpen, ClipboardCheck, ClipboardList, FileSpreadsheet } from 'lucide-react';

import { useCurrentUser } from '@/features/auth';
import { PageHeader } from '@/shared/components/page-header';
import { ShortcutGrid, type Shortcut } from '@/shared/components/shortcut-grid';
import { Badge } from '@/shared/components/ui/badge';
import { TERM_LABEL } from '@/shared/lib/constants';
import { greeting } from '@/shared/utils/format';

const SHORTCUTS: Shortcut[] = [
  {
    to: '/student/subjects',
    icon: BookOpen,
    title: 'My subjects',
    description: 'Lessons, materials and notes for every subject you take.',
  },
  {
    to: '/student/assignments',
    icon: ClipboardList,
    title: 'Assignments',
    description: 'What is due, what you have handed in, and what came back.',
  },
  {
    to: '/student/quizzes',
    icon: ClipboardCheck,
    title: 'Tests & quizzes',
    description: 'Sit an open test and review your past attempts.',
  },
  {
    to: '/student/grades',
    icon: FileSpreadsheet,
    title: 'Gradebook',
    description: 'Continuous assessment, tests and your running average.',
  },
];

/**
 * Student dashboard.
 *
 * Phase 1 renders the signed-in identity so authentication can be tested
 * end-to-end; the widgets it links to arrive with their modules in Phase 2.
 */
export default function StudentDashboard() {
  const { user, school, currentSession } = useCurrentUser();

  return (
    <div className="space-y-7">
      <PageHeader
        title={`${greeting()}, ${user.first_name}`}
        description={
          currentSession
            ? `${school?.name ?? 'Your school'} · ${currentSession.name} · ${TERM_LABEL[currentSession.term]}`
            : school?.name
        }
        actions={<Badge variant="brand">Student</Badge>}
      />
      <ShortcutGrid shortcuts={SHORTCUTS} />
    </div>
  );
}
