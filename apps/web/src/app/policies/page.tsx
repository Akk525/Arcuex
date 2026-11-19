import { AppShell } from '@/components/app-shell';
import { PoliciesPanel } from '@/components/coverage/policies-panel';
import { PageHeader } from '@/components/ui/page-header';

export default function PoliciesPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Policies"
        title="Policy portfolio"
        description="Policy source and checkpoint are shown with each record. Synthetic fixture readiness is not live chain confirmation. Prepared records provide no coverage."
      />
      <PoliciesPanel />
    </AppShell>
  );
}
