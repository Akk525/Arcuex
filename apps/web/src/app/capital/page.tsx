import { AppShell } from '@/components/app-shell';
import { CapitalPanel } from '@/components/capital/capital-panel';
import { Panel } from '@/components/panel';
import { PageHeader } from '@/components/ui/page-header';

export default function CapitalPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Ops"
        title="Capital"
        description="Inspect the synthetic solvency ledger and the conditions for confirmed pool deposits."
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <CapitalPanel />
        <Panel title="Live LP deposits">
          <p className="text-sm text-[var(--ink-muted)]">
            Confirmed Arc Testnet USDC deposits require an onchain pool, wallet approval and a
            matching receipt. This page displays the synthetic ledger.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
