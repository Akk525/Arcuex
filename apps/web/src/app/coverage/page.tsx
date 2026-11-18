import { AppShell } from '@/components/app-shell';
import { HumanProcurementPanel } from '@/components/coverage/human-procurement-panel';
import { PageHeader } from '@/components/ui/page-header';

export default function CoveragePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Coverage"
        title="Obtain coverage"
        description="Review eligibility and immutable terms, accept the exact quote digest, approve the premium, then bind. Coverage is not active until the bind receipt is confirmed."
      />
      <HumanProcurementPanel />
    </AppShell>
  );
}
