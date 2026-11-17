'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/panel';
import { ArcStatus } from '@/components/network/arc-status';
import { QuickNodeStatusPanel } from '@/components/network/quicknode-status';
import { WalletPanel } from '@/components/wallet/wallet-panel';

type OverviewResponse = {
  poolAddress: string | null;
  poolDeployed: boolean;
  arc: { rpcHost: string; health: { ok: boolean; chainId: number; blockNumber: string | null } | null; error: string | null };
  quicknode: { rpcHost: string; status: { ok: boolean; chainId: number; blockNumber: string | null } | null; error: string | null };
  streamsConfigured: boolean;
  capitalPools: Array<{ name: string; depositedMicros: string; sharesOutstanding: string }>;
  policyCount: number;
  claimCount: number;
  recent: {
    policyAudit: Array<{ eventType: string; createdAt: string; aggregateId: string }>;
    streamsInbox: Array<{ eventName: string; receivedAt: string; signatureOk: boolean }>;
  };
};

export function OverviewDashboard() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/overview')
      .then(async (r) => {
        if (!r.ok) throw new Error(`overview ${r.status}`);
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ArcStatus />
        <QuickNodeStatusPanel />
        <WalletPanel />
        <Panel title="On-chain pool">
          {error && <p className="text-sm text-red-700">{error}</p>}
          {!data && !error && <p className="text-sm text-zinc-500">Loading…</p>}
          {data && (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">InsurancePool</dt>
                <dd className="font-mono text-xs text-zinc-900">
                  {data.poolDeployed ? data.poolAddress : 'Not deployed / unset'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Streams secret</dt>
                <dd>{data.streamsConfigured ? 'Configured' : 'Missing'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Policies (ledger)</dt>
                <dd>{data.policyCount}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Claims (ledger)</dt>
                <dd>{data.claimCount}</dd>
              </div>
              <p className="pt-2 text-xs text-amber-800">
                Synthetic capital rows are demo ledger only until a confirmed testnet deposit exists.
              </p>
            </dl>
          )}
        </Panel>
      </div>

      <Panel title="Recent activity">
        {!data ? (
          <p className="text-sm text-zinc-500">No activity loaded.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Policy audit
              </h3>
              <ul className="space-y-1 text-sm">
                {data.recent.policyAudit.length === 0 && (
                  <li className="text-zinc-500">No policy events yet</li>
                )}
                {data.recent.policyAudit.map((e) => (
                  <li key={`${e.aggregateId}-${e.createdAt}-${e.eventType}`} className="font-mono text-xs">
                    {e.eventType} · {e.createdAt}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Streams inbox
              </h3>
              <ul className="space-y-1 text-sm">
                {data.recent.streamsInbox.length === 0 && (
                  <li className="text-zinc-500">No authenticated Stream deliveries</li>
                )}
                {data.recent.streamsInbox.map((e, i) => (
                  <li key={`${e.eventName}-${e.receivedAt}-${i}`} className="font-mono text-xs">
                    {e.eventName} · sig={e.signatureOk ? 'ok' : 'bad'}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
