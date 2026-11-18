import { AppShell } from '@/components/app-shell';
import { PoliciesPanel } from '@/components/coverage/policies-panel';
import { PageHeader } from '@/components/ui/page-header';

export default function PoliciesPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Policies"
        title="Policy portfolio"
        description="Prepared records are not coverage. Only confirmed on-chain binds enter an effective window. Limits and payouts shown here reflect host records and live reconciliation when available."
      />
      <PoliciesPanel />
    </AppShell>
  );
}
