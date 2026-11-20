import { AppShell } from '@/components/app-shell';
import { HumanProcurementPanel } from '@/components/coverage/human-procurement-panel';
import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

export default function AddAgentPage() {
  return (
    <AppShell>
      <PageHeader
        appearance="dark"
        title="Add an agent"
        description="Register your agent’s signer wallet and a position you control."
        action={<ButtonLink href="/agent" variant="secondary">Back to agents</ButtonLink>}
      />
      <HumanProcurementPanel registrationOnly />
    </AppShell>
  );
}
