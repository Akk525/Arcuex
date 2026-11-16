'use client';

import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';

type CapitalResponse = {
  notice: string;
  pool: {
    id: string;
    name: string;
    depositedUsdc: string;
    outstandingLiabilityUsdc: string;
    availableUsdc: string;
    sharesOutstanding: string;
  };
  activeReservations: Array<{ id: string; amountUsdc: string; status: string }>;
};

export function CapitalPanel() {
  const [data, setData] = useState<CapitalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/capital');
    setData((await res.json()) as CapitalResponse);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [refresh]);

  async function deposit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/capital', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'deposit', amountUsdc: '10.000000' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Deposit failed');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deposit failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Capital (synthetic ledger)" action={<StatusBadge label="SYNTHETIC" tone="warn" />}>
      <div className="space-y-3 text-sm text-zinc-700">
        <p className="text-xs text-amber-800">
          {data?.notice ?? 'Fully collateralized demo USDC ledger — not on-chain.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void deposit()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Deposit 10 USDC (ledger)
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700"
          >
            Refresh
          </button>
        </div>
        {error ? <p className="text-rose-700">{error}</p> : null}
        {!data ? <p className="text-zinc-500">Loading capital pool…</p> : null}
        {data ? (
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Pool</dt>
              <dd className="font-mono text-xs">{data.pool.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Deposited</dt>
              <dd className="font-mono text-sm">{data.pool.depositedUsdc} USDC</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Available</dt>
              <dd className="font-mono text-sm">{data.pool.availableUsdc} USDC</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Outstanding liability</dt>
              <dd className="font-mono text-sm">{data.pool.outstandingLiabilityUsdc} USDC</dd>
            </div>
          </dl>
        ) : null}
        {data?.activeReservations.map((r) => (
          <div key={r.id} className="rounded-lg bg-zinc-50 p-2 font-mono text-xs">
            reservation {r.id.slice(0, 8)}… · {r.status} · {r.amountUsdc}
          </div>
        ))}
      </div>
    </Panel>
  );
}
