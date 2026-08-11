import { useAuth } from '@/features/auth';

import AdminTimetablePage from './admin-timetable-page';
import ParentTimetablePage from './parent-timetable-page';
import StudentTimetablePage from './student-timetable-page';
import TeacherTimetablePage from './teacher-timetable-page';

/**
 * Shared `/…/timetable` route.
 *
 * Four views of one table, dispatched on role rather than repeated four times
 * in the router. A pupil and their guardian read the same grid; a teacher reads
 * their own week across classes; the office edits.
 */
export default function TimetablePage() {
  const { isStudent, isTeacher, isParent } = useAuth();

  if (isStudent) return <StudentTimetablePage />;
  if (isTeacher) return <TeacherTimetablePage />;
  if (isParent) return <ParentTimetablePage />;

  return <AdminTimetablePage />;
}
