'use client';

import { useEffect, useState } from 'react';
import { Panel } from '@/components/panel';
import { StatusBadge } from '@/components/status-badge';
import { claimsFetch } from '@/lib/claims/claims-api';
import {
  claimsNetworkFailure,
  parseHistoricSettlementPayload,
  readClaimsClientResponse,
} from '@/lib/claims/claims-client-response';

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
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await claimsFetch('any', '/api/claims/settlements/historic');
        const result = await readClaimsClientResponse(res, (json) => {
          const parsed = parseHistoricSettlementPayload(json);
          return parsed ? (parsed as unknown as Historic) : null;
        });
        if (!result.ok) {
          if (result.kind === 'unauthorized' || result.kind === 'forbidden') {
            setAuthRequired(true);
          }
          setError(result.message);
          return;
        }
        setData(result.data);
      } catch (e) {
        setError(claimsNetworkFailure(e).message);
      }
    })();
  }, []);

  return (
    <Panel
      title="Archived Arc Testnet settlement"
      action={<StatusBadge label="ARCHIVED" tone="neutral" />}
    >
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {authRequired ? (
        <p className="text-sm text-zinc-600">
          Sign in to view the archived Arc Testnet receipt. Current payment finality is unverified.
        </p>
      ) : null}
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
          <div className="text-xs text-zinc-500">Recorded verification at {data.verifiedAt} · historical snapshot</div>
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
