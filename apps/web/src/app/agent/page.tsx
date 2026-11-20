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
        appearance="dark"
        title="Agents"
        description="Manage registered agents, their positions and procurement delegations."
        action={
          <>
            <ButtonLink href={agentId ? `/coverage?agentId=${encodeURIComponent(agentId)}` : '/coverage?tab=products'} variant="secondary">
              Get coverage
            </ButtonLink>
            <ButtonLink href="/agent/new">Add an agent</ButtonLink>
          </>
        }
      />
      <DelegationsPanel initialAgentId={agentId} />
    </AppShell>
  );
}
