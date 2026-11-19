'use client';

import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/components/workspace-provider';
import { Button } from '@/components/ui/button';
import { useFixtureMode } from '@/providers/source-mode';

export function ProductLanding() {
  const router = useRouter();
  const { setWorkspace } = useWorkspace();
  const fixture = useFixtureMode();

  return (
    <section className="overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)]">
      <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.35fr_1fr] lg:gap-12">
        <div className="space-y-5 self-center">
          <h1 className="max-w-xl text-[2.5rem] leading-[1.08] font-semibold tracking-tight sm:text-5xl">
            Insurance workflows for autonomous agents
          </h1>
          <p className="max-w-lg text-base text-[var(--ink-muted)]">
            {fixture
              ? 'Rehearse quoting, agent delegation and claims review with synthetic policy records.'
              : 'Configure coverage on Arc Testnet, delegate procurement to agent signers and follow each claim through human review.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                setWorkspace('protect');
                router.push('/coverage');
              }}
            >
              Explore coverage
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setWorkspace('build');
                router.push('/agent');
              }}
            >
              Set up an agent
            </Button>
          </div>
        </div>
        <div className="rounded-[var(--radius)] bg-[var(--accent-soft)] p-5 sm:p-6">
          <h2 className="text-base font-semibold">From coverage to a decision</h2>
          <ol className="mt-3 divide-y divide-[var(--line)] text-sm">
            <li className="space-y-1 py-3">
              <p className="font-medium">Configure coverage</p>
              <p className="text-[var(--ink-muted)]">
                Choose a product, register the insured exposure and review a quote.
              </p>
            </li>
            <li className="space-y-1 py-3">
              <p className="font-medium">Review the policy</p>
              <p className="text-[var(--ink-muted)]">
                {fixture
                  ? 'Open the seeded policy and inspect its coverage window and fixture checkpoint.'
                  : 'Track wallet approval, binding receipt, reconciliation and coverage inception.'}
              </p>
            </li>
            <li className="space-y-1 pt-3">
              <p className="font-medium">Investigate a claim</p>
              <p className="text-[var(--ink-muted)]">
                {fixture
                  ? 'Exchange evidence on the case and record a human decision. Fixture settlement is disabled.'
                  : 'Exchange evidence and record a human decision. Payment requires a reconciled settlement receipt.'}
              </p>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
