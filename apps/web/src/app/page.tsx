import { CapitalPanel } from '@/components/capital/capital-panel';
import { ClaimsPanel } from '@/components/claims/claims-panel';
import { CoveragePanel } from '@/components/coverage/coverage-panel';
import { ArcStatus } from '@/components/network/arc-status';
import { QuickNodeStatusPanel } from '@/components/network/quicknode-status';
import { TestTransactionPanel } from '@/components/transactions/test-transaction';
import { WalletPanel } from '@/components/wallet/wallet-panel';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="space-y-2 border-b border-zinc-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Developer dashboard
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Arcuex</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-600">
          Arc Testnet connectivity, wallet flows, QuickNode RPC, and a policy-agnostic synthetic
          insurance core. Live chain panels use real Arc data; coverage/claims/capital panels are
          explicitly labeled synthetic demo ledgers.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Live Arc / wallet</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ArcStatus />
          <QuickNodeStatusPanel />
          <WalletPanel />
          <TestTransactionPanel />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Synthetic insurance core</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CoveragePanel />
          <ClaimsPanel />
          <CapitalPanel />
        </div>
      </section>

      <footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-500">
        Arc Testnet chain ID 5042002 · Docs in <code>/docs</code> · Never paste private keys
      </footer>
    </main>
  );
}
