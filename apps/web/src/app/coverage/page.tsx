import { AppShell } from '@/components/app-shell';
import { HumanProcurementPanel } from '@/components/coverage/human-procurement-panel';
import { PageHeader } from '@/components/ui/page-header';

export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ policyId?: string }>;
}) {
  const { policyId } = await searchParams;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Coverage"
        title="Obtain coverage"
        description="Select a product and review the quote. Arc Testnet payment requires separate wallet approvals, a reconciled bind and the scheduled effective time."
      />
      <HumanProcurementPanel resumePolicyId={policyId} />
    </AppShell>
  );
}
