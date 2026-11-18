import { AppShell } from '@/components/app-shell';
import { CapitalPanel } from '@/components/capital/capital-panel';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/ui/page-header';
import { Callout } from '@/components/ui/callout';

export default function CapitalPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Ops workspace"
        title="Capital"
        description="Synthetic capital accounting for beta solvency views. Not proof of on-chain LP liquidity."
      />
      <Callout kind="synthetic" title="Demo ledger">
        The SQLite capital panel is synthetic unless a confirmed testnet deposit exists for the
        configured pool.
      </Callout>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CapitalPanel />
        <Panel title="Live LP deposits">
          <p className="text-sm text-[var(--ink-muted)]">
            Confirmed Arc Testnet USDC deposits require a deployed <code>InsurancePool</code> and
            wallet approval. Deposits are not initiated from this redesign pass.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
