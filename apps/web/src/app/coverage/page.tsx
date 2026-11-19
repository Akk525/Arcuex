import { AppShell } from '@/components/app-shell';
import { HumanProcurementPanel } from '@/components/coverage/human-procurement-panel';
import { PageHeader } from '@/components/ui/page-header';

export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<{
    policyId?: string;
    agentId?: string;
    delegationId?: string;
    from?: string;
  }>;
}) {
  const { policyId, agentId, delegationId, from } = await searchParams;
  return (
    <AppShell>
      <PageHeader
        eyebrow={from === 'build' ? 'Build' : 'Protect'}
        title="Obtain coverage"
        description="Configure an insured exposure, compare product terms and review the quote before accepting."
      />
      <HumanProcurementPanel
        resumePolicyId={policyId}
        requestedAgentId={agentId}
        requestedGrantId={delegationId}
        fromBuild={from === 'build'}
      />
    </AppShell>
  );
}
