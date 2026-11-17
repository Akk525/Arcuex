import { AppShell } from '@/components/app-shell';
import { AgentProcurePanel } from '@/components/agent/agent-procure-panel';
import { Panel } from '@/components/panel';

export default function AgentPage() {
  return (
    <AppShell>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AgentProcurePanel />
        <Panel title="CLI autonomous example">
          <p className="text-sm text-zinc-600">
            For a non-UI bounded agent run:
          </p>
          <pre className="mt-3 overflow-auto rounded-md bg-zinc-50 p-3 text-xs">
            {`pnpm --filter @arcuex/agent-sdk example:autonomous-procure`}
          </pre>
          <p className="mt-3 text-xs text-zinc-500">
            Live broadcast only when operator supplies ARCUE_X_POOL_ADDRESS and
            WALLET_PRIVATE_KEY in the local shell — never stored by the Arcuex backend.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
