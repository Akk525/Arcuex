'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';

type Historic = {
  notice: string;
  explorerUrl: string;
  txHash: string;
  blockNumber: string;
  amountUsdc: string;
  beneficiary: string;
  claimsAuthority: string;
  pool: string;
  lossKey: string;
  verifiedAt: string;
};

export function HistoricSettlementPanel() {
  const [data, setData] = useState<Historic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/claims/settlements/historic')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load historic settlement');
        setData((await res.json()) as Historic);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, []);

  return (
    <Panel
      title="Verified Arc Testnet settlement (read-only)"
      action={<StatusBadge label="CHAIN RECEIPT" tone="ok" />}
    >
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {!data && !error ? <p className="text-sm text-zinc-500">Loading receipt…</p> : null}
      {data ? (
        <div className="space-y-2 text-sm">
          <p className="text-xs text-amber-800">{data.notice}</p>
          <div>
            Amount: <strong>{data.amountUsdc} USDC</strong>
          </div>
          <div className="break-all font-mono text-xs">Tx: {data.txHash}</div>
          <div className="font-mono text-xs">Block: {data.blockNumber}</div>
          <div className="break-all font-mono text-xs">Beneficiary: {data.beneficiary}</div>
          <div className="break-all font-mono text-xs">Authority: {data.claimsAuthority}</div>
          <div className="break-all font-mono text-xs">Pool: {data.pool}</div>
          <div className="break-all font-mono text-xs">Loss key: {data.lossKey}</div>
          <div className="text-xs text-zinc-500">Verified at {data.verifiedAt}</div>
          <a
            href={data.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs text-sky-800 underline"
          >
            Open on Arc explorer
          </a>
        </div>
      ) : null}
    </Panel>
  );
}
