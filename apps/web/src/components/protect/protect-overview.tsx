'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { WalletPanel } from '@/components/wallet/wallet-panel';
import { StatusBadge } from '@/components/status-badge';

type OverviewResponse = {
  poolAddress: string | null;
  poolDeployed: boolean;
  policyCount: number;
  claimCount: number;
};

export function ProtectOverview() {
  const router = useRouter();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/overview')
      .then(async (r) => {
        if (!r.ok) throw new Error(`Unable to load overview (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load overview');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Protect workspace"
        title="Policyholder overview"
        description="Connect a wallet, obtain coverage, confirm on-chain binding, then manage policies and claims. Counts below come from this host’s ledger — not invented marketing stats."
        action={<Button onClick={() => router.push('/coverage')}>Get coverage</Button>}
      />

      <Callout kind="live" title="Live vs synthetic">
        Wallet balances and confirmed pool activity are Arc Testnet. Quote fixtures and synthetic claim
        evidence are labeled in-product and are not independent loss proof.
      </Callout>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WalletPanel />
        <Panel title="Your next steps">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
            <li>Sign in with wallet session (nonce cookie).</li>
            <li>
              <Link href="/coverage" className="text-[var(--accent)] underline">
                Coverage
              </Link>{' '}
              — quote, accept digest, approve premium, bind.
            </li>
            <li>
              <Link href="/policies" className="text-[var(--accent)] underline">
                Policies
              </Link>{' '}
              — only treat status as active after confirmation.
            </li>
            <li>
              <Link href="/claims" className="text-[var(--accent)] underline">
                Claims
              </Link>{' '}
              — investigate; payment only after verified settlement.
            </li>
          </ol>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Panel title="Confirmed pool">
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {!data && !error ? <p className="text-sm text-[var(--ink-muted)]">Loading…</p> : null}
          {data ? (
            <div className="space-y-2 text-sm">
              <StatusBadge
                label={data.poolDeployed ? 'Pool configured' : 'Pool unset'}
                tone={data.poolDeployed ? 'live' : 'warn'}
              />
              <p className="break-all font-mono text-xs text-[var(--ink-muted)]">
                {data.poolAddress ?? '—'}
              </p>
            </div>
          ) : null}
        </Panel>
        <Panel title="Policies (ledger)">
          {!data && !error ? <p className="text-sm text-[var(--ink-muted)]">Loading…</p> : null}
          {data ? (
            <p className="text-2xl font-semibold tabular-nums text-[var(--ink)]">{data.policyCount}</p>
          ) : null}
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Host SQLite count, owner-filtered in APIs.</p>
        </Panel>
        <Panel title="Claims (ledger)">
          {!data && !error ? <p className="text-sm text-[var(--ink-muted)]">Loading…</p> : null}
          {data ? (
            <p className="text-2xl font-semibold tabular-nums text-[var(--ink)]">{data.claimCount}</p>
          ) : null}
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Not a payout guarantee.</p>
        </Panel>
      </div>
    </div>
  );
}
