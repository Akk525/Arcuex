'use client';

import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/components/workspace-provider';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';

export function ProductLanding() {
  const router = useRouter();
  const { setWorkspace } = useWorkspace();

  function enterProtect() {
    setWorkspace('protect');
    router.push('/coverage');
  }

  function enterBuild() {
    setWorkspace('build');
    router.push('/agent');
  }

  return (
    <div className="space-y-10">
      <section className="space-y-6 border-b border-[var(--line)] pb-10 pt-2">
        <p className="text-sm font-medium text-[var(--accent)]">Arc Testnet beta</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-[var(--ink)] sm:text-5xl">
          Arcuex
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-[var(--ink-muted)]">
          Insurance-style financial protection for autonomous agents — bind coverage on Arc Testnet,
          manage policies, and investigate claims with evidence you can audit.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button onClick={enterProtect} className="min-h-11 px-5 text-base">
            Protect my agent
          </Button>
          <Button variant="secondary" onClick={enterBuild} className="min-h-11 px-5 text-base">
            Build with Arcuex
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-[var(--ink)]">Protect</h2>
          <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
            Obtain coverage, confirm on-chain binding, then submit and track claims. Policies are not
            active until bind confirmation succeeds.
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-[var(--ink)]">Build</h2>
          <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
            Register agents, configure delegation, and integrate the same authenticated policy records
            your humans use in Protect.
          </p>
        </div>
      </section>

      <Callout kind="synthetic" title="Beta data classes">
        Live Arc Testnet reads and confirmed USDC transfers are labeled separately from synthetic quote
        fixtures, claim evidence fixtures, and demo ledgers. Ops tools stay in a separate workspace and
        require provisioned credentials.
      </Callout>
    </div>
  );
}
