import { ClipboardCheck } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

export default function AttendancePage() {
  return (
    <ModulePlaceholder
      icon={ClipboardCheck}
      title="Attendance"
      description="Daily and per-period registers, with term summaries."
      planned={[
        'Form-teacher register: mark a whole class in one pass',
        'Per-period attendance from the timetable',
        'Student attendance history and term rate',
        'Absence flags routed to guardians',
        'Class and year-group summaries for administrators',
      ]}
      dataLayer={['attendance_records', 'attendance_daily_unique', 'attendance_per_subject_unique']}
    />
  );
}
