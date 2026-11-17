import { AppShell } from '@/components/app-shell';
import { CoveragePanel } from '@/components/coverage/coverage-panel';
import { AgentProcurePanel } from '@/components/agent/agent-procure-panel';

export default function CoveragePage() {
  return (
    <AppShell>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CoveragePanel />
        <AgentProcurePanel />
      </div>
    </AppShell>
  );
}
