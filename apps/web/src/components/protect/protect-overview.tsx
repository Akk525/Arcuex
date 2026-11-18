'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/panel';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { useClaimsSession } from '@/hooks/use-claims-session';
import { useWalletStatus } from '@/hooks/use-wallet-status';

export function ProtectOverview() {
  const router = useRouter();
  const wallet = useWalletStatus();
  const { session, loading } = useClaimsSession();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Protect workspace"
        title="Your coverage journey"
        description="Connect, sign in, obtain coverage, confirm the bind, then manage policies and claims. Wallet and session status live in the header."
        action={<Button onClick={() => router.push('/coverage')}>Get coverage</Button>}
      />

      <Callout kind="live" title="Live vs synthetic">
        Confirmed Arc Testnet binds and receipts are labeled separately from synthetic quote fixtures
        and claim evidence. Prepared policies are never treated as active here.
      </Callout>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Account">
          {loading ? (
            <p className="text-sm text-[var(--ink-muted)]">Checking session…</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">Wallet</dt>
                <dd className="font-mono text-xs">
                  {wallet.address ? wallet.address : 'Not connected'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-muted)]">Claims session</dt>
                <dd>{session ? session.role : 'Not signed in'}</dd>
              </div>
            </dl>
          )}
          <p className="mt-3 text-xs text-[var(--ink-muted)]">
            Use Connect / Sign in in the header. This page does not invent portfolio totals.
          </p>
        </Panel>
        <Panel title="Next actions">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
            <li>Connect wallet and sign in (header).</li>
            <li>
              <Link href="/coverage" className="text-[var(--accent)] underline">
                Coverage wizard
              </Link>{' '}
              — quote, accept digest, approve, bind, confirm.
            </li>
            <li>
              <Link href="/policies" className="text-[var(--accent)] underline">
                Policies
              </Link>{' '}
              — view your authenticated policy list.
            </li>
            <li>
              <Link href="/claims" className="text-[var(--accent)] underline">
                Claims
              </Link>{' '}
              — submit and track cases after confirmation.
            </li>
          </ol>
        </Panel>
      </div>

      {!session && !loading ? (
        <EmptyState
          title="Sign in to load your policies and claims"
          description="Personal portfolio data appears only after a wallet session cookie is established. Host-wide ledger counts are not shown as your statistics."
          action={
            <Button variant="secondary" onClick={() => router.push('/coverage')}>
              Start coverage
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
