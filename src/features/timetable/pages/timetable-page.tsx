import { CalendarDays } from 'lucide-react';

import { useAuth } from '@/features/auth';
import { ModulePlaceholder } from '@/shared/components/module-placeholder';

import StudentTimetablePage from './student-timetable-page';
import TeacherTimetablePage from './teacher-timetable-page';

/** Shared `/…/timetable` route. Student and teacher views are live. */
export default function TimetablePage() {
  const { isStudent, isTeacher } = useAuth();

  if (isStudent) return <StudentTimetablePage />;
  if (isTeacher) return <TeacherTimetablePage />;

  return (
    <ModulePlaceholder
      icon={CalendarDays}
      title="Timetable"
      description="The weekly grid, per class and per teacher."
      planned={[
        'Administrator: drag-to-move editor with live clash detection',
        'Parent: a child’s week',
        'Room allocation and export to calendar',
      ]}
      dataLayer={[
        'timetable_slots',
        'timetable_slots_no_class_clash',
        'timetable_slots_no_teacher_clash',
      ]}
    />
  );
}
