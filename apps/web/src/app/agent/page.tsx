import { AppShell } from '@/components/app-shell';
import { DelegationsPanel } from '@/components/agent/delegations-panel';
import { PageHeader } from '@/components/ui/page-header';
import { Callout } from '@/components/ui/callout';

export default function AgentPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Build workspace"
        title="Agent management"
        description="Register agents, configure delegation scope, and procure coverage with the same authenticated identity used in Protect."
      />
      <Callout kind="info" title="Shared insurance records">
        Agents and humans share policy and claim records under wallet session auth. Privileged ops
        remain separate.
      </Callout>
      <div className="mt-6">
        <DelegationsPanel />
      </div>
    </AppShell>
  );
}
