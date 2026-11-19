import { AppShell } from '@/components/app-shell';
import { DelegationsPanel } from '@/components/agent/delegations-panel';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button';

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ agentId?: string }>;
}) {
  const { agentId } = await searchParams;
  return (
    <AppShell>
      <PageHeader
        eyebrow="Build"
        title="Agent management"
        description="Register a signer, set delegated procurement scope and review who can pay."
        action={
          <ButtonLink href="/integrations" variant="secondary">
            Integrations
          </ButtonLink>
        }
      />
      <DelegationsPanel initialAgentId={agentId} />
    </AppShell>
  );
}
