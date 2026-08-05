import { Library } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

/**
 * Placeholder for the administrator's class manager.
 *
 * It exists so `/admin/classes` stops resolving to the teacher's class list.
 * That page is scoped to `teacher_assignments`, so an administrator opening it
 * was shown an empty grid and told they teach nothing — a confusing lie rather
 * than an honest "not built yet". `classes.service.ts` and the mutation hooks
 * behind this screen already exist from the administrator phase; only the page
 * is outstanding.
 */
export default function AdminClassesPage() {
  return (
    <ModulePlaceholder
      icon={Library}
      title="Classes"
      description="Create classes, set form teachers and choose which subjects each class takes."
      planned={[
        'Create and edit classes per term, with arm and capacity',
        'Assign a form teacher and a room',
        'Choose the subjects each class takes, and periods per week',
        'Assign teachers to class–subject pairings',
      ]}
      dataLayer={['classes', 'class_subjects', 'teacher_assignments', 'admin/api/classes.service']}
    />
  );
}
