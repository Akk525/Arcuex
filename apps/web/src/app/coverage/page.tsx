import { AppShell } from '@/components/app-shell';
import { HumanProcurementPanel } from '@/components/coverage/human-procurement-panel';
import { ButtonLink } from '@/components/ui/button';
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
        eyebrow={from === 'build' ? 'Mission Control' : 'Protect'}
        appearance="light"
        title="Buy Coverage"
        action={<ButtonLink href="/coverage/applications" variant="secondary">Apply for tailored coverage</ButtonLink>}
        description="Choose a product, set the terms and review the quote. You pay from your own wallet, and coverage begins only after the bind is reconciled on Arc Testnet."
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
