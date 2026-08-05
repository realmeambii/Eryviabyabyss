import { ShieldCheck } from 'lucide-react';

import { ModulePlaceholder } from '@/shared/components/module-placeholder';

export default function AuditPage() {
  return (
    <ModulePlaceholder
      icon={ShieldCheck}
      title="Audit log"
      description="Who changed what, and when."
      planned={[
        'Filterable trail by actor, entity and date range',
        'Before/after diff for each change',
        'Role-grant and enrolment history',
        'CSV export for inspections',
      ]}
      dataLayer={['audit_logs (append-only)', 'app.audit_row()', 'audit_logs_select_admin']}
    />
  );
}
