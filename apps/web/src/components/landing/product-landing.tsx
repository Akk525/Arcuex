'use client';

import { useRouter } from 'next/navigation';
import { PROCUREMENT_PRODUCT as PRODUCT } from '@arcuex/domain/procurement';
import { useWorkspace } from '@/components/workspace-provider';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { StatusBadge } from '@/components/status-badge';

const JOURNEY = [
  {
    title: 'Protect',
    detail: 'Register a synthetic exposure, accept an immutable quote digest, approve USDC, bind on Arc Testnet.',
  },
  {
    title: 'Confirm',
    detail: 'Coverage is scheduled only after bind receipt verification — never from a prepared record alone.',
  },
  {
    title: 'Claim',
    detail: 'Open a ClaimsCase, attach labeled evidence, move through REVIEW without implying payment.',
  },
] as const;

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
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-[calc(var(--radius)+4px)] border border-[var(--line)] bg-[var(--surface)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,var(--accent-soft)_0%,transparent_42%,#e8eef1_100%)]"
        />
        <div className="relative grid gap-10 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label="Arc Testnet beta" tone="live" />
              <StatusBadge label="Synthetic product labeled" tone="synthetic" />
            </div>
            <h1 className="max-w-xl text-[2.5rem] font-semibold leading-[1.08] tracking-tight text-[var(--ink)] sm:text-5xl">
              Financial protection for agents that can actually bind on-chain.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-[var(--ink-muted)] sm:text-lg">
              Arcuex helps humans and developers procure coverage, confirm Arc Testnet binds, and
              investigate claims with evidence you can audit — without confusing demo fixtures for
              live payouts.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button onClick={enterProtect} className="min-h-12 px-6 text-base">
                Protect my agent
              </Button>
              <Button
                variant="secondary"
                onClick={enterBuild}
                className="min-h-12 px-6 text-base"
              >
                Build with Arcuex
              </Button>
            </div>
            <p className="text-xs text-[var(--ink-muted)]">
              Product: {PRODUCT.code}. Pricing note: {PRODUCT.pricing}
            </p>
          </div>

          <aside
            aria-label="Grounded demo workflow"
            className="rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)]/90 p-5 shadow-[0_1px_0_rgba(15,23,32,0.04)]"
          >
            <p className="text-xs font-medium text-[var(--accent)]">Demo workflow · not live activity</p>
            <p className="mt-2 text-sm font-semibold text-[var(--ink)]">
              {PRODUCT.name ?? 'Oracle adapter liquidation cover'}
            </p>
            <ol className="mt-5 space-y-4">
              {JOURNEY.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[11px] font-medium text-white"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">{step.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-[var(--ink-muted)]">
                      {step.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 border-t border-[var(--line)] pt-4 text-xs text-[var(--ink-muted)]">
              Illustrative stages only. No fabricated balances, claim payouts, or verified incidents.
            </div>
          </aside>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Protect</h2>
          <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
            For policyholders: obtain coverage, confirm the bind, manage policies, submit and track
            claims. Policies are not active until confirmation succeeds.
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-[var(--ink)]">Build</h2>
          <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
            For developers: register agents, configure delegation, and integrate the same
            authenticated policy records used in Protect.
          </p>
        </div>
      </section>

      <Callout kind="synthetic" title="Beta disclosures">
        Live Arc Testnet reads and confirmed USDC transfers are labeled separately from synthetic
        quote fixtures and claim evidence. Ops requires provisioned credentials; the UI never grants
        privilege by itself.
      </Callout>
    </div>
  );
}
