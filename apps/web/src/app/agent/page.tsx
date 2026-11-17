import { AppShell } from '@/components/app-shell';
import { DelegationsPanel } from '@/components/agent/delegations-panel';
export default function AgentPage() {
  return (
    <AppShell>
      <DelegationsPanel />
    </AppShell>
  );
}
