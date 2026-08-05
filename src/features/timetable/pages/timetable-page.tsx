import { CalendarDays } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

export default function TimetablePage() {
  return (
    <ModulePlaceholder
      icon={CalendarDays}
      title="Timetable"
      description="The weekly grid, per class and per teacher."
      planned={[
        'Weekly grid, Monday to Friday, with the current period highlighted',
        'Teacher view across every class they take',
        'Administrator editor with drag-to-move periods',
        'Room allocation and clash reporting',
        'Export to calendar (.ics)',
      ]}
      dataLayer={[
        'timetable_slots',
        'timetable_slots_no_class_clash',
        'timetable_slots_no_teacher_clash',
      ]}
    />
  );
}
