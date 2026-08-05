import { Megaphone } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

export default function AnnouncementsPage() {
  return (
    <ModulePlaceholder
      icon={Megaphone}
      title="Announcements"
      description="Notices from the school, your class and your teachers."
      planned={[
        'Noticeboard with pinned and urgent notices first',
        'Audience picker: whole school, a class, a role, one person',
        'Scheduled publishing and automatic expiry',
        'Read receipts for urgent notices',
      ]}
      dataLayer={[
        'announcements',
        'announcements_select_audience',
        'app.notify_on_announcement_published()',
      ]}
    />
  );
}
