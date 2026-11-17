import { AppShell } from '@/components/app-shell';
import { CapitalPanel } from '@/components/capital/capital-panel';
import { Panel } from '@/components/panel';

export default function CapitalPage() {
  return (
    <AppShell>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CapitalPanel />
        <Panel title="Live LP deposits">
          <p className="text-sm text-zinc-600">
            Confirmed Arc Testnet USDC deposits require a deployed{' '}
            <code>InsurancePool</code> and wallet approval. Use{' '}
            <code>scripts/deploy-insurance-pool.sh</code> with a funded deployer, then set{' '}
            <code>ARCUE_X_POOL_ADDRESS</code>.
          </p>
          <p className="mt-3 text-xs text-amber-800">
            The adjacent panel is the synthetic SQLite capital ledger — not proof of on-chain
            liquidity.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
