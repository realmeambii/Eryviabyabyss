import { Users } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

export default function TeacherClassesPage() {
  return (
    <ModulePlaceholder
      icon={Users}
      title="My classes"
      description="The classes and subjects assigned to you this term."
      planned={[
        'Class roster with photographs and admission numbers',
        'Per-class subject view with the scheme of work',
        'Lesson builder for notes, video and attachments',
        'Class performance overview against the year group',
      ]}
      dataLayer={['teacher_assignments', 'classes', 'enrollments', 'app.teaches_class()']}
    />
  );
}
