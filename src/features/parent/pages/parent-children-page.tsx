import { UsersRound } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

export default function ParentChildrenPage() {
  return (
    <ModulePlaceholder
      icon={UsersRound}
      title="My children"
      description="Everything the school records about each of your children."
      planned={[
        'Child switcher across siblings',
        'Class, form teacher and subject teachers',
        'Assignment and result history',
        'Attendance summary with absence reasons',
        'Direct message to the form teacher',
      ]}
      dataLayer={['parent_students', 'app.is_my_child()', 'app.my_children()']}
    />
  );
}
